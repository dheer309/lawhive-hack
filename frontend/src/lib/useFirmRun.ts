"use client";

import { useCallback, useRef, useState } from "react";
import { AGENTS } from "./agents";
import { api, type ClarifyResponse } from "./api";
import { DEMO_DELAYS, DEMO_RESULTS } from "./demo-replay";
import type { IntakeRequest, StageId, StageResults } from "./types";

export type AgentStatus = "pending" | "active" | "done" | "error";

export interface Interview {
  summary: string;
  requests: IntakeRequest[];
}

export interface FirmState {
  // idle = intake landing; interview = reception asking follow-ups; running =
  // the rest of the firm working; done = pack ready.
  phase: "idle" | "interview" | "running" | "done";
  active: StageId | null;
  statuses: Record<StageId, AgentStatus>;
  results: StageResults;
  caseId: string | null;
  interview: Interview | null;
  demo: boolean;
  error?: string;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Minimum time each agent is shown working, so fast live calls still read as work.
const MIN_DWELL: Record<StageId, number> = {
  intake: 600,
  entities: 1000,
  gmail: 1100,
  synthesis: 1400,
  recommend: 1300,
  pack: 1000,
};

// Stages that auto-run after intake is complete.
const RUN_STAGES: StageId[] = ["entities", "gmail", "synthesis", "recommend", "pack"];

const initialStatuses = () =>
  Object.fromEntries(AGENTS.map((a) => [a.id, "pending"])) as Record<StageId, AgentStatus>;

const initialState = (): FirmState => ({
  phase: "idle",
  active: null,
  statuses: initialStatuses(),
  results: {},
  caseId: null,
  interview: null,
  demo: false,
});

export function useFirmRun() {
  const [state, setState] = useState<FirmState>(initialState);
  const running = useRef(false);
  // Mirror caseId in a ref so the auto-run reads the latest value, not a stale closure.
  const caseIdRef = useRef<string | null>(null);

  const setActive = useCallback((id: StageId) => {
    setState((s) => ({ ...s, active: id, statuses: { ...s.statuses, [id]: "active" } }));
  }, []);

  const setDone = useCallback((id: StageId, result: unknown) => {
    setState((s) => ({
      ...s,
      active: null,
      statuses: { ...s.statuses, [id]: "done" },
      results: { ...s.results, [id]: result } as StageResults,
    }));
  }, []);

  // Plays the canned hero results with lifelike timing (no backend needed).
  const playReplay = useCallback(async () => {
    setState({ ...initialState(), phase: "running", demo: true });
    for (const a of AGENTS) {
      setActive(a.id);
      await sleep(DEMO_DELAYS[a.id]);
      setDone(a.id, DEMO_RESULTS[a.id]);
      await sleep(200);
    }
    setState((s) => ({ ...s, phase: "done", active: null }));
  }, [setActive, setDone]);

  // Auto-run everything after intake. Each stage falls back to canned data.
  const beginRun = useCallback(async () => {
    const caseId = caseIdRef.current;
    setState((s) => ({
      ...s,
      phase: "running",
      interview: null,
      active: null,
      statuses: { ...s.statuses, intake: "done" },
    }));
    if (!caseId) {
      await playReplay();
      running.current = false;
      return;
    }

    const call: Record<StageId, () => Promise<unknown>> = {
      intake: async () => null,
      entities: () => api.extractEntities(caseId),
      gmail: () => api.connectGmail(caseId),
      synthesis: () => api.synthesize(caseId),
      recommend: () => api.recommend(caseId),
      pack: () => api.generatePack(caseId),
    };

    for (const id of RUN_STAGES) {
      setActive(id);
      try {
        const [r] = await Promise.all([call[id](), sleep(MIN_DWELL[id])]);
        setDone(id, r);
      } catch {
        await sleep(MIN_DWELL[id]);
        setDone(id, DEMO_RESULTS[id]);
        setState((s) => ({ ...s, demo: true }));
      }
    }

    setState((s) => ({ ...s, phase: "done", active: null }));
    running.current = false;
  }, [setActive, setDone, playReplay]);

  // Kick off: intake -> if more is needed, go to the interview; else run.
  const start = useCallback(
    async (transcript: string, files: File[] = []) => {
      if (running.current) return;
      running.current = true;
      caseIdRef.current = null;
      setState({
        ...initialState(),
        phase: "interview",
        statuses: { ...initialStatuses(), intake: "active" },
      });
      try {
        const r = await api.intake(transcript, files);
        caseIdRef.current = r.case_id;
        setState((s) => ({ ...s, caseId: r.case_id, results: { ...s.results, intake: r } }));
        if (r.ready || !(r.requests && r.requests.length)) {
          await beginRun();
        } else {
          setState((s) => ({ ...s, interview: { summary: r.summary, requests: r.requests! } }));
        }
      } catch {
        await playReplay();
        running.current = false;
      }
    },
    [beginRun, playReplay],
  );

  // Answer the current round of follow-ups; loop or proceed.
  const submitClarify = useCallback(
    async (responses: ClarifyResponse[], files: File[] = []) => {
      const caseId = caseIdRef.current;
      if (!caseId) return;
      try {
        const r = await api.clarify(caseId, responses, files);
        setState((s) => ({
          ...s,
          results: {
            ...s.results,
            intake: { ...(s.results.intake ?? { case_id: caseId, summary: "" }), summary: r.summary },
          },
        }));
        if (r.ready || !r.requests.length) {
          await beginRun();
        } else {
          setState((s) => ({ ...s, interview: { summary: r.summary, requests: r.requests } }));
        }
      } catch {
        await beginRun();
      }
    },
    [beginRun],
  );

  const skipInterview = useCallback(async () => {
    await beginRun();
  }, [beginRun]);

  // Re-run the Gmail stage on demand (after the user completes OAuth).
  const rerunGmail = useCallback(async () => {
    const caseId = caseIdRef.current;
    if (!caseId) return;
    setActive("gmail");
    try {
      setDone("gmail", await api.connectGmail(caseId));
    } catch {
      setDone("gmail", DEMO_RESULTS.gmail);
    }
  }, [setActive, setDone]);

  const replay = useCallback(async () => {
    if (running.current) return;
    running.current = true;
    await playReplay();
    running.current = false;
  }, [playReplay]);

  const reset = useCallback(() => {
    running.current = false;
    caseIdRef.current = null;
    setState(initialState());
  }, []);

  return { state, start, submitClarify, skipInterview, rerunGmail, replay, reset };
}

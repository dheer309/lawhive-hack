"use client";

import { useCallback, useRef, useState } from "react";
import { AGENTS } from "./agents";
import { api } from "./api";
import { DEMO_DELAYS, DEMO_RESULTS } from "./demo-replay";
import type { IntakeResult, StageId, StageResults } from "./types";

export type AgentStatus = "pending" | "active" | "done" | "error";

export interface FirmState {
  phase: "idle" | "running" | "done";
  active: StageId | null;
  statuses: Record<StageId, AgentStatus>;
  results: StageResults;
  caseId: string | null;
  demo: boolean;
  error?: string;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Minimum time each agent is shown working, so fast live calls still read as work.
const MIN_DWELL: Record<StageId, number> = {
  intake: 800,
  entities: 1000,
  gmail: 1100,
  synthesis: 1400,
  recommend: 1300,
  pack: 1000,
};

const initialStatuses = () =>
  Object.fromEntries(AGENTS.map((a) => [a.id, "pending"])) as Record<
    StageId,
    AgentStatus
  >;

const initialState = (): FirmState => ({
  phase: "idle",
  active: null,
  statuses: initialStatuses(),
  results: {},
  caseId: null,
  demo: false,
});

export function useFirmRun() {
  const [state, setState] = useState<FirmState>(initialState);
  const running = useRef(false);

  const setActive = useCallback((id: StageId) => {
    setState((s) => ({
      ...s,
      active: id,
      statuses: { ...s.statuses, [id]: "active" },
    }));
  }, []);

  const setDone = useCallback((id: StageId, result: unknown) => {
    setState((s) => ({
      ...s,
      active: null,
      statuses: { ...s.statuses, [id]: "done" },
      results: { ...s.results, [id]: result } as StageResults,
      caseId: id === "intake" ? (result as IntakeResult).case_id : s.caseId,
    }));
  }, []);

  const markDemo = useCallback(() => setState((s) => ({ ...s, demo: true })), []);

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

  const start = useCallback(
    async (transcript: string) => {
      if (running.current) return;
      running.current = true;
      setState({ ...initialState(), phase: "running" });

      // Intake yields the case_id. If the backend is unreachable, replay it all.
      setActive("intake");
      let caseId: string;
      try {
        const [r] = await Promise.all([api.intake(transcript), sleep(MIN_DWELL.intake)]);
        caseId = r.case_id;
        setDone("intake", r);
      } catch {
        await playReplay();
        running.current = false;
        return;
      }

      // Remaining stages: live, with per-stage fallback to canned data.
      const runStage = async (id: StageId, call: () => Promise<unknown>) => {
        setActive(id);
        try {
          const [r] = await Promise.all([call(), sleep(MIN_DWELL[id])]);
          setDone(id, r);
        } catch {
          await sleep(MIN_DWELL[id]);
          setDone(id, DEMO_RESULTS[id]);
          markDemo();
        }
      };

      await runStage("entities", () => api.extractEntities(caseId));
      await runStage("gmail", () => api.connectGmail(caseId));
      await runStage("synthesis", () => api.synthesize(caseId));
      await runStage("recommend", () => api.recommend(caseId));
      await runStage("pack", () => api.generatePack(caseId));

      setState((s) => ({ ...s, phase: "done", active: null }));
      running.current = false;
    },
    [setActive, setDone, markDemo, playReplay],
  );

  const replay = useCallback(async () => {
    if (running.current) return;
    running.current = true;
    await playReplay();
    running.current = false;
  }, [playReplay]);

  const reset = useCallback(() => setState(initialState()), []);

  return { state, start, replay, reset };
}

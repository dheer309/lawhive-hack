"use client";

import { useState } from "react";
import { Intake } from "@/components/Intake";
import { Interview } from "@/components/Interview";
import { Office } from "@/components/Office";
import { CaseBoard } from "@/components/CaseBoard";
import { useFirmRun } from "@/lib/useFirmRun";

export default function Home() {
  const { state, start, submitClarify, skipInterview, rerunGmail, replay, reset } = useFirmRun();
  const [statement, setStatement] = useState("");

  if (state.phase === "idle") {
    return (
      <Intake
        onStart={(t, files) => {
          setStatement(t);
          start(t, files);
        }}
        onReplay={() => {
          setStatement("");
          replay();
        }}
      />
    );
  }

  const interviewing = state.phase === "interview";

  return (
    <div className="flex h-screen flex-col gap-3 p-3 sm:p-4">
      <header className="flex shrink-0 items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="grid h-7 w-7 place-items-center rounded-md bg-lime text-sm font-black text-ink">L</span>
          <span className="text-sm font-semibold">The Lawfice</span>
          {state.demo && (
            <span className="label rounded bg-ink-soft px-2 py-1 text-muted">demo replay</span>
          )}
          {state.error && (
            <span className="label ml-2 rounded bg-[#3a1f18] px-2 py-1 text-[#e2a07f]">{state.error}</span>
          )}
        </div>
        <button
          onClick={() => {
            reset();
            setStatement("");
          }}
          className="rounded-lg border border-ink-line px-3 py-1.5 text-xs font-medium text-paper/80 transition hover:bg-ink-soft"
        >
          New case
        </button>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 lg:grid-cols-[minmax(0,560px)_1fr]">
        <div className="flex min-h-0 flex-col gap-2">
          <div className="min-h-[360px] flex-1">
            <Office state={state} />
          </div>
          {statement && (
            <p className="line-clamp-2 shrink-0 rounded-xl border border-ink-line bg-ink-soft/40 px-4 py-2 text-xs italic text-muted">
              “{statement}”
            </p>
          )}
        </div>

        <div className="min-h-0">
          {interviewing ? (
            state.interview && state.caseId ? (
              <Interview
                interview={state.interview}
                caseId={state.caseId}
                onSubmit={submitClarify}
                onSkip={skipInterview}
              />
            ) : (
              <div className="flex h-full items-center justify-center rounded-2xl border border-paper-line bg-paper text-ink">
                <p className="label text-ink/45">Reading your story…</p>
              </div>
            )
          ) : (
            <CaseBoard state={state} onConnectGmail={rerunGmail} />
          )}
        </div>
      </div>
    </div>
  );
}

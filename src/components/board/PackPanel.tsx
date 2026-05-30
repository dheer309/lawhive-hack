"use client";

import type { PackResult, SynthesisResult } from "@/lib/types";

export function PackPanel({
  pack,
  synthesis,
}: {
  pack: PackResult;
  synthesis?: SynthesisResult;
}) {
  return (
    <div className="rounded-xl border border-paper-line bg-white/60">
      <div className="flex items-center justify-between border-b border-paper-line px-4 py-2.5">
        <span className="text-sm font-semibold text-ink">Your case pack is ready</span>
        <span className="label rounded bg-ink px-2 py-1 text-lime">PDF</span>
      </div>
      <div className="space-y-2 px-4 py-3">
        {synthesis?.case_summary && (
          <p className="text-sm leading-relaxed text-ink/75">{synthesis.case_summary}</p>
        )}
        <p className="text-xs text-ink/50">
          A single document with the summary, timeline, evidence index and recommendation —
          ready to use yourself or hand to a solicitor.
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2 border-t border-paper-line px-4 py-3">
        <a
          href={pack.pack_url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 rounded-lg bg-ink px-4 py-2 text-sm font-semibold text-lime transition hover:bg-ink-soft"
        >
          Download case pack
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 3v12m0 0 4-4m-4 4-4-4M5 21h14" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </a>
        <span className="label ml-auto max-w-[55%] truncate text-ink/40">{pack.pack_url}</span>
      </div>
    </div>
  );
}

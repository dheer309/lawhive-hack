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
        <span className="label rounded bg-ink px-2 py-1 text-lime">ready to file</span>
      </div>
      <div className="space-y-2 px-4 py-3">
        {(synthesis?.analysis || synthesis?.case_summary) && (
          <p className="text-sm leading-relaxed text-ink/75">{synthesis.analysis ?? synthesis.case_summary}</p>
        )}
        <p className="text-xs text-ink/50">
          Your details for the form, a plain-English statement to paste, the emails we&apos;ve drafted
          for you, your evidence bundle, and the few things only you can do.
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2 border-t border-paper-line px-4 py-3">
        <a
          href={pack.pack_url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 rounded-lg bg-ink px-4 py-2 text-sm font-semibold text-lime transition hover:bg-ink-soft"
        >
          Open case pack
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M14 3h7v7M21 3l-9 9M5 7v12h12" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </a>
        <span className="label ml-auto max-w-[55%] truncate text-ink/40">{pack.pack_url}</span>
      </div>
    </div>
  );
}

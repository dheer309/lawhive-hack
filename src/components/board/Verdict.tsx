"use client";

import { useEffect, useState } from "react";
import type { RecommendResult } from "@/lib/types";

const REC_META: Record<string, { label: string; color: string; tag: string }> = {
  pursue_without_lawyer: { label: "Pursue — without a lawyer", color: "#a8d12f", tag: "Winnable on your own" },
  pursue_with_lawyer: { label: "Pursue — with a lawyer", color: "#8aa0f0", tag: "Worth it — get help" },
  do_not_pursue: { label: "Not worth pursuing", color: "#d08a5a", tag: "The numbers don't add up" },
  not_worth_it: { label: "Not worth pursuing", color: "#d08a5a", tag: "The numbers don't add up" },
};

function recMeta(rec: string) {
  return (
    REC_META[rec] ?? {
      label: rec.replace(/_/g, " "),
      color: "#9aa0a6",
      tag: "Recommendation",
    }
  );
}

const CONF_FILL: Record<string, number> = { high: 0.9, medium: 0.6, low: 0.33 };

// Semicircle gauge, centre (70,70), radius 56, spanning 180°.
const R = 56;
const ARC = `M 14 70 A ${R} ${R} 0 0 1 126 70`;
const LEN = Math.PI * R;

export function Verdict({ data }: { data: RecommendResult }) {
  const rec = recMeta(data.recommendation);
  const confKey = (data.confidence || "").toLowerCase();
  const target = CONF_FILL[confKey] ?? 0.5;
  const [shown, setShown] = useState(0);

  useEffect(() => {
    const t = setTimeout(() => setShown(target), 120);
    return () => clearTimeout(t);
  }, [target]);

  return (
    <div className="space-y-3">
      <div className="flex flex-col items-center sm:flex-row sm:items-center sm:gap-6">
        <div className="relative shrink-0">
          <svg width="140" height="86" viewBox="0 0 140 78">
            <path d={ARC} fill="none" stroke="#d2ccba" strokeWidth="11" strokeLinecap="round" />
            <path
              d={ARC}
              fill="none"
              stroke={rec.color}
              strokeWidth="11"
              strokeLinecap="round"
              strokeDasharray={LEN}
              strokeDashoffset={LEN - LEN * shown}
              style={{ transition: "stroke-dashoffset 1.1s cubic-bezier(0.22,1,0.36,1)" }}
            />
          </svg>
          <div className="absolute inset-x-0 bottom-0 flex flex-col items-center">
            <span className="text-lg font-bold uppercase tracking-wide text-ink">{confKey || "—"}</span>
            <span className="label text-ink/50">confidence</span>
          </div>
        </div>
        <div className="mt-3 text-center sm:mt-0 sm:text-left">
          <span
            className="inline-block rounded-full px-3 py-1 text-xs font-semibold text-ink"
            style={{ backgroundColor: rec.color }}
          >
            {rec.label}
          </span>
          <p className="label mt-2 text-ink/45">{rec.tag}</p>
        </div>
      </div>
      <p className="text-sm leading-relaxed text-ink/80">{data.reasoning}</p>
    </div>
  );
}

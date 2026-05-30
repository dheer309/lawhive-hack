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
const CHECK_COLOR: Record<string, string> = {
  pass: "#16a34a",
  attention: "#d97706",
  fail: "#dc2626",
  unknown: "#9aa0a6",
};

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

  const routes: [string, string | undefined][] = [
    ["Route", data.route_primary],
    ["Backstop", data.route_backstop],
    ["Avoid", data.route_avoid],
  ];

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

      {data.time_limit && (
        <p className="rounded-md border border-[#fed7aa] bg-[#fff7ed] px-3 py-2 text-sm text-[#9a5a1a]">
          ⏰ <span className="font-semibold">Act before:</span> {data.time_limit}
        </p>
      )}

      {routes.some(([, v]) => v) && (
        <div className="space-y-1 rounded-lg border border-paper-line bg-white/50 p-3 text-sm">
          {routes.map(([label, val]) =>
            val ? (
              <p key={label} className="text-ink/75">
                <span className="font-semibold text-ink">{label}: </span>
                {val}
              </p>
            ) : null,
          )}
        </div>
      )}

      {!!data.checks?.length && (
        <ul className="space-y-1 text-sm">
          {data.checks.map((c, i) => (
            <li key={i} className="text-ink/75">
              <span style={{ color: CHECK_COLOR[c.status] ?? CHECK_COLOR.unknown }}>●</span>{" "}
              <span className="font-medium text-ink">{c.label}</span>
              <span className="text-ink/55"> — {c.note}</span>
            </li>
          ))}
        </ul>
      )}

      {!!data.next_steps?.length && (
        <div>
          <p className="label mb-1 text-ink/45">What you need to do</p>
          <ol className="list-decimal space-y-1 pl-5 text-sm text-ink/80">
            {data.next_steps.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}

import Stage from "./Stage.jsx";

const VERDICTS = {
  pursue_with_lawyer: {
    title: "Pursue — with a lawyer",
    emoji: "⚖️",
    ring: "border-amber-400/40 bg-amber-500/10",
    text: "text-amber-300",
  },
  pursue_without_lawyer: {
    title: "Pursue — you can do this yourself",
    emoji: "✅",
    ring: "border-emerald-400/40 bg-emerald-500/10",
    text: "text-emerald-300",
  },
  do_not_pursue: {
    title: "Not worth pursuing",
    emoji: "🛑",
    ring: "border-rose-400/40 bg-rose-500/10",
    text: "text-rose-300",
  },
};

const CHECK_DOT = {
  pass: "text-emerald-400",
  attention: "text-amber-400",
  fail: "text-rose-400",
  unknown: "text-gray-500",
};

// Stage 5 — verdict + merits & route brief: reasoning, the recommended route,
// what to avoid, knockout checks, a time-limit flag, and next steps.
export default function Recommendation({ locked, loading, done, data, onRun }) {
  const verdict = data && VERDICTS[data.recommendation];

  return (
    <Stage index={5} title="Recommendation" locked={locked} loading={loading} done={done}>
      {!verdict ? (
        <button
          onClick={onRun}
          disabled={loading}
          className="w-full rounded-lg bg-indigo-500 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-400 disabled:opacity-40"
        >
          Get recommendation
        </button>
      ) : (
        <div className="space-y-4">
          <div className={`rounded-xl border p-6 ${verdict.ring}`}>
            <div className="flex items-center gap-3">
              <span className="text-4xl">{verdict.emoji}</span>
              <div>
                <h3 className={`text-lg font-bold ${verdict.text}`}>{verdict.title}</h3>
                <p className="text-xs uppercase tracking-wider text-gray-400">
                  Confidence: {data.confidence}
                </p>
              </div>
            </div>
            <p className="mt-4 text-sm leading-relaxed text-gray-300">{data.reasoning}</p>
          </div>

          {data.time_limit && (
            <div className="rounded-lg border border-amber-400/40 bg-amber-500/10 p-3 text-sm text-amber-200">
              ⏰ <span className="font-semibold">Act before:</span> {data.time_limit}
            </div>
          )}

          {(data.route_primary || data.route_backstop || data.route_avoid) && (
            <div className="space-y-2 rounded-lg border border-white/10 bg-black/30 p-4 text-sm">
              <p className="text-xs uppercase tracking-wider text-gray-500">How to pursue it</p>
              {data.route_primary && (
                <p className="text-gray-300">
                  <span className="font-semibold text-emerald-300">Route: </span>
                  {data.route_primary}
                </p>
              )}
              {data.route_backstop && (
                <p className="text-gray-400">
                  <span className="font-semibold text-sky-300">Backstop: </span>
                  {data.route_backstop}
                </p>
              )}
              {data.route_avoid && (
                <p className="text-gray-400">
                  <span className="font-semibold text-rose-300">Avoid: </span>
                  {data.route_avoid}
                </p>
              )}
            </div>
          )}

          {(data.checks || []).length > 0 && (
            <div className="rounded-lg border border-white/10 bg-black/30 p-4">
              <p className="mb-2 text-xs uppercase tracking-wider text-gray-500">
                Knockout &amp; threshold checks
              </p>
              <ul className="space-y-1.5 text-sm">
                {data.checks.map((c, i) => (
                  <li key={i} className="text-gray-300">
                    <span className={CHECK_DOT[c.status] || CHECK_DOT.unknown}>●</span>{" "}
                    <span className="font-medium">{c.label}</span>
                    <span className="text-gray-400"> — {c.note}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {(data.next_steps || []).length > 0 && (
            <div className="rounded-lg border border-white/10 bg-black/30 p-4">
              <p className="mb-2 text-xs uppercase tracking-wider text-gray-500">Next steps</p>
              <ol className="list-decimal space-y-1 pl-5 text-sm text-gray-300">
                {data.next_steps.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ol>
            </div>
          )}
        </div>
      )}
    </Stage>
  );
}

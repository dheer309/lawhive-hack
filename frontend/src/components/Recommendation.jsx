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

// Stage 5 — large verdict card with confidence + reasoning.
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
      )}
    </Stage>
  );
}

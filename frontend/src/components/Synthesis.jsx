import Stage from "./Stage.jsx";

// Stage 4 — chronology timeline, key evidence, case summary.
export default function Synthesis({ locked, loading, done, data, onRun }) {
  const hasData = data && data.chronology;

  return (
    <Stage index={4} title="Synthesis" locked={locked} loading={loading} done={done}>
      {!hasData ? (
        <button
          onClick={onRun}
          disabled={loading}
          className="w-full rounded-lg bg-indigo-500 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-400 disabled:opacity-40"
        >
          Synthesise case
        </button>
      ) : (
        <div className="space-y-6">
          <div>
            <p className="mb-3 text-xs uppercase tracking-wider text-gray-500">Chronology</p>
            <ol className="relative border-l border-white/10 pl-5">
              {data.chronology.map((item, i) => (
                <li key={i} className="mb-4 last:mb-0">
                  <span className="absolute -left-[5px] mt-1 h-2.5 w-2.5 rounded-full bg-indigo-400" />
                  <p className="text-xs font-semibold text-indigo-300">{item.date}</p>
                  <p className="text-sm text-gray-300">{item.event}</p>
                </li>
              ))}
            </ol>
          </div>

          <div>
            <p className="mb-2 text-xs uppercase tracking-wider text-gray-500">Key evidence</p>
            <ul className="space-y-2">
              {data.key_evidence.map((item, i) => (
                <li key={i} className="rounded-lg border border-white/10 bg-black/30 p-3 text-sm">
                  <span className="font-semibold text-sky-300">{item.source}</span>
                  <span className="text-gray-400"> — {item.detail}</span>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <p className="mb-2 text-xs uppercase tracking-wider text-gray-500">Case summary</p>
            <p className="text-sm leading-relaxed text-gray-300">{data.case_summary}</p>
          </div>
        </div>
      )}
    </Stage>
  );
}

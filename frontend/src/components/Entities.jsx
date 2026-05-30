import Stage from "./Stage.jsx";

const GROUPS = [
  { key: "names", label: "Names", color: "bg-pink-500/15 text-pink-300" },
  { key: "dates", label: "Dates", color: "bg-amber-500/15 text-amber-300" },
  { key: "keywords", label: "Keywords", color: "bg-sky-500/15 text-sky-300" },
  { key: "addresses", label: "Addresses", color: "bg-violet-500/15 text-violet-300" },
];

// Stage 2 — extracted entities shown as chips.
export default function Entities({ locked, loading, done, data, onRun }) {
  const hasData = data && Object.keys(data).length > 0;

  return (
    <Stage index={2} title="Entities" locked={locked} loading={loading} done={done}>
      {!hasData ? (
        <button
          onClick={onRun}
          disabled={loading}
          className="w-full rounded-lg bg-indigo-500 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-400 disabled:opacity-40"
        >
          Extract entities
        </button>
      ) : (
        <div className="space-y-4">
          {GROUPS.map(({ key, label, color }) => (
            <div key={key}>
              <p className="mb-1.5 text-xs uppercase tracking-wider text-gray-500">{label}</p>
              <div className="flex flex-wrap gap-2">
                {(data[key] || []).map((item, i) => (
                  <span key={i} className={`rounded-full px-3 py-1 text-xs ${color}`}>
                    {item}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </Stage>
  );
}

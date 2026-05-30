import Stage from "./Stage.jsx";

// Stage 6 — generate + download the full case pack.
export default function DocumentPack({ locked, loading, done, data, onRun }) {
  const ready = data && data.pack_url;

  return (
    <Stage index={6} title="Document Pack" locked={locked} loading={loading} done={done}>
      <p className="mb-3 text-sm text-gray-400">
        Chronology, sourced evidence, case summary and legal basis — lawyer-ready.
      </p>

      {!ready ? (
        <button
          onClick={onRun}
          disabled={loading}
          className="w-full rounded-lg bg-indigo-500 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-400 disabled:opacity-40"
        >
          Generate case pack
        </button>
      ) : (
        <a
          href={data.pack_url}
          target="_blank"
          rel="noreferrer"
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-500 py-3 text-sm font-semibold text-white transition hover:bg-emerald-400"
        >
          ⬇ Download case pack (PDF)
        </a>
      )}
    </Stage>
  );
}

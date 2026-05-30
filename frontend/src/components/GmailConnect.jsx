import Stage from "./Stage.jsx";

// Stage 3 — Gmail OAuth (mocked) + emails-found readout.
export default function GmailConnect({ locked, loading, done, data, onRun }) {
  const connected = data && data.status === "connected";

  return (
    <Stage index={3} title="Gmail Connect" locked={locked} loading={loading} done={done}>
      <p className="mb-3 text-sm text-gray-400">
        Connect your inbox so the agents can search it using the entities above.
      </p>

      {!connected ? (
        <button
          onClick={onRun}
          disabled={loading}
          className="flex w-full items-center justify-center gap-2 rounded-lg border border-white/15 bg-white py-2.5 text-sm font-semibold text-gray-800 transition hover:bg-gray-100 disabled:opacity-40"
        >
          <span className="text-base">📧</span> Connect Gmail
        </button>
      ) : (
        <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-4 text-sm">
          <p className="font-semibold text-emerald-300">✓ Inbox connected</p>
          <p className="mt-1 text-gray-300">
            Found <span className="font-bold text-white">{data.emails_found}</span> relevant emails.
          </p>
        </div>
      )}
    </Stage>
  );
}

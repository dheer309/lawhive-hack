import { useState } from "react";
import Stage from "./Stage.jsx";
import { api } from "../api.js";

// Stage 3 — connect Gmail (real OAuth when configured, mock otherwise) and search
// the inbox using the extracted entities as anchors. Self-managed: reports busy
// to the parent and calls onComplete with the result.
export default function GmailConnect({ locked, loading, done, data, caseId, onWorking, onComplete }) {
  const [awaitingAuth, setAwaitingAuth] = useState(false);

  async function run() {
    onWorking(true);
    try {
      const res = await api.connectGmail(caseId);
      if (res.status === "needs_auth") {
        window.open(res.auth_url, "_blank", "noopener");
        setAwaitingAuth(true);
      } else if (res.status === "error") {
        alert(`Gmail search failed: ${res.error}`);
      } else {
        setAwaitingAuth(false);
        onComplete(res); // connected (real or mock)
      }
    } catch (err) {
      alert(`Gmail failed: ${err.message}`);
    } finally {
      onWorking(false);
    }
  }

  return (
    <Stage index={3} title="Gmail Connect" locked={locked} loading={loading} done={done}>
      <p className="mb-3 text-sm text-gray-400">
        Connect your inbox and CasePilot searches it for the relevant emails and documents, using
        the names, dates and keywords it pulled out.
      </p>

      {done && data ? (
        <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-4 text-sm">
          <p className="font-semibold text-emerald-300">✓ Inbox searched</p>
          <p className="mt-1 text-gray-300">
            Found <span className="font-bold text-white">{data.emails_found}</span> relevant emails
            {data.configured === false ? " (demo data)" : ""}.
          </p>
          {(data.results || []).length > 0 && (
            <ul className="mt-3 space-y-1.5">
              {data.results.map((r, i) => (
                <li key={i} className="border-l-2 border-sky-500/40 pl-2 text-xs text-gray-400">
                  <span className="text-gray-200">{r.subject}</span>
                  {r.from && <span> — {r.from}</span>}
                  {r.date && <span className="text-gray-500"> · {r.date}</span>}
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : awaitingAuth ? (
        <div className="space-y-3">
          <p className="text-sm text-gray-400">
            Finish signing in to Google in the tab that opened, then come back and search.
          </p>
          <button
            onClick={run}
            disabled={loading}
            className="w-full rounded-lg bg-indigo-500 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-400 disabled:opacity-40"
          >
            🔎 Search my inbox
          </button>
        </div>
      ) : (
        <button
          onClick={run}
          disabled={loading}
          className="flex w-full items-center justify-center gap-2 rounded-lg border border-white/15 bg-white py-2.5 text-sm font-semibold text-gray-800 transition hover:bg-gray-100 disabled:opacity-40"
        >
          <span className="text-base">📧</span> Connect Gmail
        </button>
      )}
    </Stage>
  );
}

import { useRef, useState } from "react";
import Stage from "./Stage.jsx";

// Stage 4 — chronology (with links into the evidence), evidence map,
// a detailed narrative of what happened, and the legislation that applies.
export default function Synthesis({ locked, loading, done, data, onRun }) {
  const hasData = data && data.chronology;
  const [highlight, setHighlight] = useState(null);
  const evidenceRefs = useRef({});

  // Click an evidence chip on a chronology row -> scroll to + flash that card.
  function jumpTo(id) {
    const el = evidenceRefs.current[id];
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    setHighlight(id);
    setTimeout(() => setHighlight((h) => (h === id ? null : h)), 1600);
  }

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
          {/* Chronology + evidence, side by side on wider screens */}
          <div className="grid gap-6 md:grid-cols-2">
            <div>
              <p className="mb-3 text-xs uppercase tracking-wider text-gray-500">Chronology</p>
              <ol className="relative border-l border-white/10 pl-5">
                {data.chronology.map((item, i) => (
                  <li key={i} className="mb-4 last:mb-0">
                    <span className="absolute -left-[5px] mt-1 h-2.5 w-2.5 rounded-full bg-indigo-400" />
                    <p className="text-xs font-semibold text-indigo-300">{item.date}</p>
                    <p className="text-sm text-gray-300">{item.event}</p>
                    {(item.evidence_ids || []).length > 0 && (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {item.evidence_ids.map((id) => (
                          <button
                            key={id}
                            onClick={() => jumpTo(id)}
                            className="rounded bg-sky-500/15 px-1.5 py-0.5 text-[10px] font-medium text-sky-300 transition hover:bg-sky-500/30"
                            title="Jump to evidence"
                          >
                            {id} ↗
                          </button>
                        ))}
                      </div>
                    )}
                  </li>
                ))}
              </ol>
            </div>

            <div>
              <p className="mb-3 text-xs uppercase tracking-wider text-gray-500">Evidence</p>
              <ul className="space-y-2">
                {data.key_evidence.map((item) => (
                  <li
                    key={item.id}
                    ref={(el) => (evidenceRefs.current[item.id] = el)}
                    className={`rounded-lg border bg-black/30 p-3 text-sm transition ${
                      highlight === item.id
                        ? "border-sky-400 ring-2 ring-sky-400/50"
                        : "border-white/10"
                    }`}
                  >
                    <span className="mr-1 rounded bg-sky-500/15 px-1.5 py-0.5 text-[10px] font-bold text-sky-300">
                      {item.id}
                    </span>
                    <span className="font-semibold text-sky-200">{item.source}</span>
                    <span className="text-gray-400"> — {item.detail}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Detailed narrative */}
          <div>
            <p className="mb-2 text-xs uppercase tracking-wider text-gray-500">What we think happened</p>
            <p className="whitespace-pre-line text-sm leading-relaxed text-gray-300">{data.analysis}</p>
          </div>

          {/* Legislation, grounded in legislation.gov.uk */}
          {(data.legislation || []).length > 0 && (
            <div>
              <p className="mb-2 text-xs uppercase tracking-wider text-gray-500">
                Legal basis (England &amp; Wales)
              </p>
              <ul className="space-y-2">
                {data.legislation.map((law, i) => (
                  <li key={i} className="rounded-lg border border-white/10 bg-black/30 p-3 text-sm">
                    <div className="font-semibold text-emerald-300">
                      {law.url ? (
                        <a href={law.url} target="_blank" rel="noreferrer" className="hover:underline">
                          {law.title} ↗
                        </a>
                      ) : (
                        law.title
                      )}
                      {law.provision && <span className="text-gray-400"> · {law.provision}</span>}
                    </div>
                    <p className="mt-0.5 text-gray-400">{law.relevance}</p>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </Stage>
  );
}

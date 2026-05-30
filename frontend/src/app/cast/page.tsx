"use client";

import { AGENTS } from "@/lib/agents";
import { CharacterAvatar } from "@/components/CharacterAvatar";

export default function CastPreview() {
  return (
    <div className="min-h-screen px-6 py-10">
      <div className="mx-auto max-w-5xl">
        <p className="label text-muted">The Firm · the cast</p>
        <h1 className="mt-2 text-3xl font-bold">Flat-vector characters (no pixel art)</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted">
          Each agent is a parametric SVG bust — different hair, glasses, beard and skin
          tone, plus a signature accent colour. Crisp at any size, animated, zero sprite art.
        </p>

        {/* the six, in 'done' state */}
        <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
          {AGENTS.map((a) => (
            <div
              key={a.id}
              className="flex flex-col items-center rounded-xl border border-ink-line bg-ink-soft/60 px-2 py-4 text-center"
            >
              <CharacterAvatar agent={a.id} accent={a.accent} status="done" size={104} />
              <p className="mt-3 text-sm font-semibold">{a.name}</p>
              <p className="label mt-1 text-muted">{a.title}</p>
              <p className="mt-2 text-xs text-muted">{a.blurb}</p>
            </div>
          ))}
        </div>

        {/* the three states */}
        <p className="label mt-10 text-muted">The three states (idle · working · done)</p>
        <div className="mt-3 flex items-center gap-8">
          {(["pending", "active", "done"] as const).map((st) => (
            <div key={st} className="flex flex-col items-center">
              <CharacterAvatar agent="recommend" accent="#f0abfc" status={st} size={96} />
              <span className="label mt-2 text-muted">{st}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

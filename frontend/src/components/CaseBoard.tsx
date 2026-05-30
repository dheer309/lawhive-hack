"use client";

import { motion } from "framer-motion";
import type { ReactNode } from "react";
import { AGENT_MAP } from "@/lib/agents";
import type { StageId } from "@/lib/types";
import type { AgentStatus, FirmState } from "@/lib/useFirmRun";
import { Verdict } from "./board/Verdict";
import { PackPanel } from "./board/PackPanel";

function Chip({ children, tone = "ink" }: { children: ReactNode; tone?: "ink" | "lime" | "soft" }) {
  const cls =
    tone === "lime"
      ? "bg-lime text-ink"
      : tone === "soft"
        ? "bg-paper-dim text-ink/70"
        : "bg-ink text-paper";
  return <span className={`inline-block rounded-md px-2 py-1 text-xs font-medium ${cls}`}>{children}</span>;
}

function Skeleton() {
  return (
    <div className="animate-pulse space-y-2 py-1">
      <div className="h-3 w-2/3 rounded bg-paper-dim" />
      <div className="h-3 w-full rounded bg-paper-dim" />
      <div className="h-3 w-4/5 rounded bg-paper-dim" />
    </div>
  );
}

function Section({
  agent,
  status,
  error,
  children,
}: {
  agent: StageId;
  status: AgentStatus;
  error?: string;
  children: ReactNode;
}) {
  if (status === "pending") return null;
  const meta = AGENT_MAP[agent];
  return (
    <section className="border-t border-paper-line px-5 py-4 first:border-t-0">
      <div className="mb-3 flex items-center gap-2">
        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: meta.accent }} />
        <span className="label text-ink/45">
          {meta.title} · {meta.name}
        </span>
      </div>
      {status === "active" && <Skeleton />}
      {status === "error" && <p className="text-sm text-[#c2643f]">{error}</p>}
      {status === "done" && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}>
          {children}
        </motion.div>
      )}
    </section>
  );
}

function FactRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="label w-20 shrink-0 text-ink/40">{label}</span>
      {children}
    </div>
  );
}

export function CaseBoard({
  state,
  onConnectGmail,
}: {
  state: FirmState;
  onConnectGmail?: () => void;
}) {
  const r = state.results;
  const title = r.intake?.summary?.split(/(?<=\.)\s/)[0] ?? "Your case";

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-2xl border border-paper-line bg-paper text-ink">
      <div className="diaggrid flex items-center justify-between border-b border-paper-line bg-paper-dim/70 px-5 py-3">
        <div>
          <p className="label text-ink/45">The case board</p>
          <h2 className="mt-0.5 text-base font-bold text-ink">{title}</h2>
        </div>
        <span className="label text-ink/40">building live</span>
      </div>

      <div className="nicescroll flex-1 overflow-y-auto">
        {/* 1 — intake / case header */}
        <Section agent="intake" status={state.statuses.intake}>
          {r.intake && (
            <div className="space-y-2">
              <p className="text-sm leading-relaxed text-ink/80">{r.intake.summary}</p>
              <p className="label text-ink/40">case ref · {r.intake.case_id}</p>
            </div>
          )}
        </Section>

        {/* 2 — entities / facts */}
        <Section agent="entities" status={state.statuses.entities}>
          {r.entities && (
            <div className="space-y-3 text-sm">
              <FactRow label="People">
                {r.entities.names.map((n, i) => (
                  <Chip key={i} tone="soft">{n}</Chip>
                ))}
              </FactRow>
              <FactRow label="Dates">
                {r.entities.dates.map((d, i) => (
                  <Chip key={i} tone="soft">{d}</Chip>
                ))}
              </FactRow>
              {r.entities.addresses.length > 0 && (
                <FactRow label="Addresses">
                  {r.entities.addresses.map((a, i) => (
                    <Chip key={i} tone="soft">{a}</Chip>
                  ))}
                </FactRow>
              )}
              <FactRow label="Keywords">
                {r.entities.keywords.map((k, i) => (
                  <Chip key={i} tone="lime">{k}</Chip>
                ))}
              </FactRow>
            </div>
          )}
        </Section>

        {/* 3 — gmail / evidence connect */}
        <Section agent="gmail" status={state.statuses.gmail}>
          {r.gmail && r.gmail.status === "needs_auth" ? (
            <div className="rounded-lg border border-paper-line bg-white/50 p-3">
              <p className="text-sm font-semibold text-ink">Connect your inbox to find supporting emails</p>
              <p className="mt-1 text-xs text-ink/55">
                Angela can search your Gmail for the threads that back up the story.
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {r.gmail.auth_url && (
                  <a
                    href={r.gmail.auth_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-md bg-ink px-3 py-1.5 text-xs font-semibold text-lime"
                  >
                    Connect Gmail
                  </a>
                )}
                {onConnectGmail && (
                  <button
                    onClick={onConnectGmail}
                    className="rounded-md border border-paper-line px-3 py-1.5 text-xs font-semibold text-ink/80 hover:border-ink/40"
                  >
                    Search my inbox
                  </button>
                )}
              </div>
            </div>
          ) : (
            r.gmail && (
              <div className="rounded-lg border border-paper-line bg-white/50 p-3">
                <div className="flex items-center gap-3">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-ink text-lime">✉</span>
                  <div>
                    <p className="text-sm font-semibold text-ink">
                      Inbox {r.gmail.status} — {r.gmail.emails_found ?? 0} relevant emails
                      {r.gmail.configured === false ? " (demo)" : ""}
                    </p>
                    <p className="text-xs text-ink/55">Scanned the mailbox for threads that back up the story.</p>
                  </div>
                </div>
                {!!r.gmail.results?.length && (
                  <ul className="mt-2 space-y-1">
                    {r.gmail.results.map((e, i) => (
                      <li key={i} className="border-l-2 border-ink/15 pl-2 text-xs text-ink/65">
                        <span className="font-medium text-ink/80">{e.subject}</span>
                        {e.from && <span> — {e.from}</span>}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )
          )}
        </Section>

        {/* 4 — synthesis / timeline + evidence + analysis + legislation */}
        <Section agent="synthesis" status={state.statuses.synthesis}>
          {r.synthesis && (
            <div className="space-y-4">
              <ol className="relative ml-1 space-y-3 border-l border-paper-line pl-4">
                {r.synthesis.chronology.map((e, i) => (
                  <li key={i} className="relative">
                    <span className="absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full border-2 border-paper bg-ink" />
                    <p className="text-sm font-semibold text-ink">{e.date}</p>
                    <p className="text-sm text-ink/75">{e.event}</p>
                  </li>
                ))}
              </ol>

              <div>
                <p className="label mb-1.5 text-ink/45">Key evidence</p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {r.synthesis.key_evidence.map((h, i) => (
                    <div key={i} className="rounded-lg border border-paper-line bg-white/50 p-3">
                      <p className="text-xs font-semibold text-ink">
                        {h.href ? (
                          <a href={h.href} target="_blank" rel="noopener noreferrer" className="underline decoration-dotted">
                            {h.source} ↗
                          </a>
                        ) : (
                          h.source
                        )}
                      </p>
                      <p className="mt-1 text-xs text-ink/65">{h.detail}</p>
                      {h.corroborated === false && (
                        <p className="mt-1 text-[11px] font-medium text-[#b5772b]">⚠️ only your account — not yet evidenced</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {(r.synthesis.analysis || r.synthesis.case_summary) && (
                <p className="rounded bg-paper-dim/60 px-3 py-2 text-sm leading-relaxed text-ink/75">
                  {r.synthesis.analysis ?? r.synthesis.case_summary}
                </p>
              )}

              {!!r.synthesis.legislation?.length && (
                <div>
                  <p className="label mb-1.5 text-ink/45">Legal basis (England &amp; Wales)</p>
                  <ul className="space-y-1.5">
                    {r.synthesis.legislation.map((l, i) => (
                      <li key={i} className="text-xs text-ink/70">
                        {l.url ? (
                          <a href={l.url} target="_blank" rel="noopener noreferrer" className="font-semibold text-ink underline decoration-dotted">
                            {l.title} ↗
                          </a>
                        ) : (
                          <span className="font-semibold text-ink">{l.title}</span>
                        )}
                        {l.provision && <span className="text-ink/50"> · {l.provision}</span>}
                        {l.relevance && <span> — {l.relevance}</span>}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </Section>

        {/* 5 — recommendation / verdict */}
        <Section agent="recommend" status={state.statuses.recommend}>
          {r.recommend && <Verdict data={r.recommend} />}
        </Section>

        {/* 6 — pack */}
        <Section agent="pack" status={state.statuses.pack}>
          {r.pack && <PackPanel pack={r.pack} synthesis={r.synthesis} />}
        </Section>

        <div className="h-8" />
      </div>
    </div>
  );
}

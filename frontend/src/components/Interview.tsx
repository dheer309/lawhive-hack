"use client";

import { useState } from "react";
import { api, type ClarifyResponse } from "@/lib/api";
import type { Interview as InterviewData } from "@/lib/useFirmRun";
import type { GmailResult } from "@/lib/types";
import { DictateButton } from "@/lib/voice";

interface Answer {
  text?: string;
  confirm?: "yes" | "no";
  file?: File | null;
  unavailable?: boolean;
}

export function Interview({
  interview,
  caseId,
  onSubmit,
  onSkip,
}: {
  interview: InterviewData;
  caseId: string;
  onSubmit: (responses: ClarifyResponse[], files: File[]) => Promise<void>;
  onSkip: () => void;
}) {
  const { requests } = interview;
  const [ans, setAns] = useState<Record<number, Answer>>({});
  const [gmail, setGmail] = useState<GmailResult | null>(null);
  const [busy, setBusy] = useState(false);

  const update = (i: number, patch: Answer) =>
    setAns((a) => ({ ...a, [i]: { ...a[i], ...patch } }));
  const append = (i: number, t: string) =>
    setAns((a) => ({ ...a, [i]: { ...a[i], text: a[i]?.text ? `${a[i].text} ${t}` : t } }));

  const hasDocs = requests.some((r) => r.kind === "document");

  async function searchGmail() {
    setBusy(true);
    try {
      const r = await api.connectGmail(caseId);
      if (r.status === "needs_auth" && r.auth_url) window.open(r.auth_url, "_blank", "noopener");
      setGmail(r);
    } catch {
      /* ignore */
    } finally {
      setBusy(false);
    }
  }

  async function submit() {
    const responses: ClarifyResponse[] = [];
    const files: File[] = [];
    requests.forEach((r, i) => {
      const a = ans[i] || {};
      if (r.kind === "document") {
        if (a.file) {
          files.push(a.file);
          responses.push({ question: `Document: ${r.label}`, answer: `Provided "${a.file.name}"` });
        } else if (a.unavailable) {
          responses.push({
            question: `Document: ${r.label}`,
            answer: `Don't have / can't find${gmail ? " — please search my Gmail to recover it." : ""}`,
          });
        }
      } else if (r.kind === "confirm") {
        const conf = a.confirm ?? "yes";
        let answer = conf === "yes" ? r.value || "" : (a.text || "").trim();
        if (conf === "no" && !answer) answer = `That's not correct (not "${r.value}").`;
        if (answer) responses.push({ question: r.label, answer });
      } else if ((a.text || "").trim()) {
        responses.push({ question: r.label, answer: (a.text || "").trim() });
      }
    });
    setBusy(true);
    try {
      await onSubmit(responses, files);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-2xl border border-paper-line bg-paper text-ink">
      <div className="diaggrid flex items-center justify-between border-b border-paper-line bg-paper-dim/70 px-5 py-3">
        <div>
          <p className="label text-ink/45">Reception · Pam</p>
          <h2 className="mt-0.5 text-base font-bold text-ink">A few details to make your case stronger</h2>
        </div>
        <span className="label text-ink/40">intake</span>
      </div>

      <div className="nicescroll flex-1 space-y-3 overflow-y-auto px-5 py-4">
        {requests.map((r, i) => {
          const a = ans[i] || {};
          if (r.kind === "confirm") {
            const conf = a.confirm ?? "yes";
            return (
              <div key={i} className="rounded-lg border border-paper-line bg-white/50 p-3">
                <p className="text-sm font-medium text-ink">{r.label}</p>
                {r.why && <p className="text-xs text-ink/50">{r.why}</p>}
                <p className="mt-1 text-sm">
                  <span className="text-ink/45">We have: </span>
                  <span className="font-semibold text-ink">{r.value}</span>
                </p>
                <div className="mt-2 flex gap-2">
                  <button
                    onClick={() => update(i, { confirm: "yes" })}
                    className={`rounded-md px-3 py-1 text-xs font-semibold ${conf === "yes" ? "bg-lime text-ink" : "bg-paper-dim text-ink/70"}`}
                  >
                    ✓ Yes
                  </button>
                  <button
                    onClick={() => update(i, { confirm: "no" })}
                    className={`rounded-md px-3 py-1 text-xs font-semibold ${conf === "no" ? "bg-ink text-paper" : "bg-paper-dim text-ink/70"}`}
                  >
                    ✕ No, change
                  </button>
                </div>
                {conf === "no" && (
                  <div className="mt-2 flex items-start gap-2">
                    <textarea
                      value={a.text || ""}
                      onChange={(e) => update(i, { text: e.target.value })}
                      rows={1}
                      placeholder="The correct answer…"
                      className="w-full resize-none rounded-lg border border-paper-line bg-white p-2 text-sm text-ink outline-none focus:border-ink/40"
                    />
                    <DictateButton onText={(t) => append(i, t)} />
                  </div>
                )}
              </div>
            );
          }
          if (r.kind === "document") {
            return (
              <div key={i} className="rounded-lg border border-paper-line bg-white/50 p-3">
                <p className="text-sm font-medium text-ink">📄 {r.label}</p>
                {r.why && <p className="text-xs text-ink/50">{r.why}</p>}
                <div className="mt-2 flex flex-wrap items-center gap-3">
                  <label
                    className={`cursor-pointer rounded-md border border-paper-line px-3 py-1 text-xs ${a.unavailable ? "pointer-events-none opacity-40" : "text-ink/80 hover:border-ink/40"}`}
                  >
                    {a.file ? `✓ ${a.file.name}` : "Upload"}
                    <input
                      type="file"
                      className="hidden"
                      onChange={(e) =>
                        e.target.files?.[0] && update(i, { file: e.target.files[0], unavailable: false })
                      }
                    />
                  </label>
                  <label className="flex items-center gap-1.5 text-xs text-ink/55">
                    <input
                      type="checkbox"
                      checked={!!a.unavailable}
                      onChange={(e) => update(i, { unavailable: e.target.checked, file: null })}
                    />
                    Can&apos;t find this
                  </label>
                </div>
              </div>
            );
          }
          return (
            <div key={i}>
              <label className="text-sm font-medium text-ink">{r.label}</label>
              {r.why && <p className="mb-1 text-xs text-ink/50">{r.why}</p>}
              <div className="flex items-start gap-2">
                <textarea
                  value={a.text || ""}
                  onChange={(e) => update(i, { text: e.target.value })}
                  rows={2}
                  className="w-full resize-none rounded-lg border border-paper-line bg-white p-2.5 text-sm text-ink outline-none focus:border-ink/40"
                />
                <DictateButton onText={(t) => append(i, t)} />
              </div>
            </div>
          );
        })}

        {hasDocs &&
          (gmail ? (
            <p className="rounded-lg border border-paper-line bg-white/50 p-3 text-xs text-ink/70">
              {gmail.status === "needs_auth"
                ? "Finish Google sign-in in the new tab, then submit — we'll pull the documents from your inbox."
                : `✓ Searched your inbox — ${gmail.emails_found ?? 0} relevant emails found.`}
            </p>
          ) : (
            <button
              onClick={searchGmail}
              disabled={busy}
              className="w-full rounded-lg border border-paper-line bg-white/50 py-2 text-xs font-semibold text-ink/80 transition hover:border-ink/40 disabled:opacity-50"
            >
              🔎 Can&apos;t find a document? Search my Gmail
            </button>
          ))}
      </div>

      <div className="flex shrink-0 gap-2 border-t border-paper-line px-5 py-3">
        <button
          onClick={submit}
          disabled={busy}
          className="flex-1 rounded-lg bg-lime py-2.5 text-sm font-bold text-ink transition hover:bg-lime-deep disabled:opacity-50"
        >
          {busy ? "Working…" : "Submit"}
        </button>
        <button
          onClick={onSkip}
          disabled={busy}
          className="rounded-lg border border-paper-line px-4 py-2.5 text-sm font-medium text-ink/70 transition hover:bg-paper-dim disabled:opacity-50"
        >
          Skip
        </button>
      </div>
    </div>
  );
}

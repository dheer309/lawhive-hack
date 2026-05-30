"use client";

import { useState } from "react";
import { api, type ClarifyResponse } from "@/lib/api";
import type { Interview as InterviewData } from "@/lib/useFirmRun";
import type { GmailResult } from "@/lib/types";
import { DictateButton } from "@/lib/voice";

interface Answer {
  text?: string;
  confirm?: "yes" | "no";
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
  const docReqs = interview.requests.filter((r) => r.kind === "document");
  const other = interview.requests.filter((r) => r.kind !== "document");

  const [ans, setAns] = useState<Record<number, Answer>>({});
  const [docFiles, setDocFiles] = useState<File[]>([]);
  const [dragging, setDragging] = useState(false);
  const [gmail, setGmail] = useState<GmailResult | null>(null);
  const [busy, setBusy] = useState(false);

  const update = (i: number, patch: Answer) => setAns((a) => ({ ...a, [i]: { ...a[i], ...patch } }));
  const append = (i: number, t: string) =>
    setAns((a) => ({ ...a, [i]: { ...a[i], text: a[i]?.text ? `${a[i].text} ${t}` : t } }));

  function addFiles(list: FileList | null) {
    const picked = list ? Array.from(list) : [];
    if (picked.length) setDocFiles((f) => [...f, ...picked]);
  }

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
    // question / confirm
    other.forEach((r) => {
      const idx = interview.requests.indexOf(r);
      const a = ans[idx] || {};
      if (r.kind === "confirm") {
        const conf = a.confirm ?? "yes";
        let answer = conf === "yes" ? r.value || "" : (a.text || "").trim();
        if (conf === "no" && !answer) answer = `That's not correct (not "${r.value}").`;
        if (answer) responses.push({ question: r.label, answer });
      } else if ((a.text || "").trim()) {
        responses.push({ question: r.label, answer: (a.text || "").trim() });
      }
    });
    // documents (grouped)
    if (docReqs.length) {
      const names = docReqs.map((r) => r.label).join("; ");
      const uploaded = docFiles.map((f) => f.name).join(", ");
      let answer = `Key documents requested: ${names}. `;
      answer += uploaded ? `Files I've uploaded: ${uploaded}. ` : "I haven't uploaded any of these. ";
      if (gmail) {
        answer +=
          gmail.status === "needs_auth"
            ? "I'm connecting Gmail so you can search my inbox for them."
            : `I connected Gmail (${gmail.emails_found ?? 0} relevant emails found) to find the rest.`;
      } else if (!uploaded) {
        answer += "I don't have these to hand right now.";
      }
      responses.push({ question: "Supporting documents", answer });
    }

    setBusy(true);
    try {
      await onSubmit(responses, docFiles);
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
        {/* question / confirm */}
        {other.map((r) => {
          const i = interview.requests.indexOf(r);
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

        {/* documents — gathered together, or found in the inbox */}
        {docReqs.length > 0 && (
          <div className="rounded-lg border border-paper-line bg-white/50 p-3">
            <p className="text-sm font-semibold text-ink">Key documents that would strengthen your case</p>
            <ul className="mt-1.5 space-y-1">
              {docReqs.map((r, i) => (
                <li key={i} className="text-xs text-ink/70">
                  📄 <span className="font-medium text-ink/85">{r.label}</span>
                  {r.why && <span className="text-ink/50"> — {r.why}</span>}
                </li>
              ))}
            </ul>

            {/* Option A: drop them all */}
            <label
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragging(false);
                addFiles(e.dataTransfer.files);
              }}
              className={`mt-3 flex cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed py-5 text-center text-xs transition ${
                dragging ? "border-ink bg-paper-dim" : "border-paper-line text-ink/60 hover:border-ink/40"
              }`}
            >
              <span className="font-medium text-ink/80">Have them? Drop or select them all here</span>
              <span className="text-ink/45">PDFs, images, emails — any of the above, together</span>
              <input
                type="file"
                multiple
                className="hidden"
                onChange={(e) => {
                  addFiles(e.target.files);
                  e.target.value = "";
                }}
              />
            </label>
            {docFiles.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {docFiles.map((f, i) => (
                  <span key={i} className="flex items-center gap-1 rounded-md bg-paper-dim px-2 py-1 text-xs text-ink/70">
                    📄 {f.name}
                    <button
                      onClick={() => setDocFiles((fs) => fs.filter((_, idx) => idx !== i))}
                      className="text-ink/40 hover:text-ink"
                      aria-label="Remove"
                    >
                      ✕
                    </button>
                  </span>
                ))}
              </div>
            )}

            {/* Option B: let us find them */}
            <div className="mt-3 border-t border-paper-line pt-3">
              {gmail ? (
                <p className="text-xs text-ink/70">
                  {gmail.status === "needs_auth"
                    ? "Finish Google sign-in in the new tab, then submit — we'll pull the documents from your inbox."
                    : `✓ Searched your inbox — ${gmail.emails_found ?? 0} relevant emails found.`}
                </p>
              ) : (
                <button
                  onClick={searchGmail}
                  disabled={busy}
                  className="w-full rounded-lg border border-paper-line py-2 text-xs font-semibold text-ink/80 transition hover:border-ink/40 disabled:opacity-50"
                >
                  Don&apos;t have them to hand? 🔎 Connect Gmail and let CasePilot find them
                </button>
              )}
            </div>
          </div>
        )}
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

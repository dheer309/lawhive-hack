"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import type { EmailDraft, PackResult, SynthesisResult } from "@/lib/types";

type SendState = "idle" | "sending" | "saved" | "error";

function EmailStep({ email, caseId }: { email: EmailDraft; caseId: string | null }) {
  const [open, setOpen] = useState(false);
  const [send, setSend] = useState<SendState>("idle");
  const [msg, setMsg] = useState("");

  async function sendToDrafts() {
    if (!caseId) return;
    setSend("sending");
    setMsg("");
    try {
      const r = await api.gmailDraft(caseId, { to: email.to, subject: email.subject, body: email.body });
      if (r.status === "created") {
        setSend("saved");
      } else if (r.status === "needs_auth" || r.status === "error") {
        setSend("error");
        setMsg(
          r.status === "needs_auth"
            ? "Connect Gmail first (with draft permission)."
            : "Couldn't save — reconnect Gmail to grant draft access.",
        );
        if (r.auth_url) window.open(r.auth_url, "_blank", "noopener");
      } else {
        setSend("error");
        setMsg("Gmail isn't configured.");
      }
    } catch {
      setSend("error");
      setMsg("Something went wrong.");
    }
  }

  return (
    <div className="rounded-lg border border-paper-line bg-white/60 p-3">
      <p className="text-sm font-semibold text-ink">✉️ {email.purpose || "Email to send"}</p>
      <p className="mt-0.5 text-xs text-ink/55">
        <b>To:</b> {email.to || "—"} · <b>Subject:</b> {email.subject || "—"}
      </p>
      {open && (
        <pre className="mt-2 max-h-56 overflow-auto whitespace-pre-wrap rounded bg-paper-dim/60 p-2 font-sans text-xs leading-relaxed text-ink/80">
          {email.body}
        </pre>
      )}
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button
          onClick={sendToDrafts}
          disabled={send === "sending" || send === "saved"}
          className="rounded-md bg-ink px-3 py-1.5 text-xs font-semibold text-lime transition hover:bg-ink-soft disabled:opacity-60"
        >
          {send === "saved" ? "✓ Saved to Gmail drafts" : send === "sending" ? "Saving…" : "Send to Gmail drafts"}
        </button>
        <button
          onClick={() => navigator.clipboard?.writeText(email.body)}
          className="rounded-md border border-paper-line px-3 py-1.5 text-xs font-medium text-ink/70 hover:border-ink/40"
        >
          Copy
        </button>
        <button
          onClick={() => setOpen((o) => !o)}
          className="text-xs text-ink/50 underline decoration-dotted hover:text-ink"
        >
          {open ? "Hide" : "Preview"}
        </button>
        {msg && <span className="text-[11px] text-[#b5772b]">{msg}</span>}
      </div>
    </div>
  );
}

export function PackPanel({
  pack,
  synthesis,
  caseId,
}: {
  pack: PackResult;
  synthesis?: SynthesisResult;
  caseId?: string | null;
}) {
  const emails = pack.emails ?? [];

  return (
    <div className="space-y-3">
      {emails.length > 0 && (
        <div>
          <p className="label mb-1.5 text-ink/45">Step 1 — send this first</p>
          <div className="space-y-2">
            {emails.map((e, i) => (
              <EmailStep key={i} email={e} caseId={caseId ?? null} />
            ))}
          </div>
        </div>
      )}

      <div>
        {emails.length > 0 && <p className="label mb-1.5 text-ink/45">Step 2 — then file your claim</p>}
        <div className="rounded-xl border border-paper-line bg-white/60">
          <div className="flex items-center justify-between border-b border-paper-line px-4 py-2.5">
            <span className="text-sm font-semibold text-ink">Your case pack is ready</span>
            <span className="label rounded bg-ink px-2 py-1 text-lime">ready to file</span>
          </div>
          <div className="space-y-2 px-4 py-3">
            {(synthesis?.analysis || synthesis?.case_summary) && (
              <p className="text-sm leading-relaxed text-ink/75">
                {synthesis.analysis ?? synthesis.case_summary}
              </p>
            )}
            <p className="text-xs text-ink/50">
              Your details for the form, a plain-English statement to paste, your evidence bundle, and
              the few things only you can do.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 border-t border-paper-line px-4 py-3">
            <a
              href={pack.pack_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-lg bg-ink px-4 py-2 text-sm font-semibold text-lime transition hover:bg-ink-soft"
            >
              Open case pack
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M14 3h7v7M21 3l-9 9M5 7v12h12" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </a>
            <span className="label ml-auto max-w-[55%] truncate text-ink/40">{pack.pack_url}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

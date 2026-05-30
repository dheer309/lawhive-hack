// Thin client for the CasePilot Flask backend. Calls go directly to the backend
// (CORS is enabled there). Override the host with NEXT_PUBLIC_BACKEND_URL;
// defaults to the Flask dev port.

import type {
  ClarifyResult,
  EntitiesResult,
  GmailDraftResult,
  GmailResult,
  IntakeResult,
  PackResult,
  RecommendResult,
  SynthesisResult,
} from "./types";

export const BACKEND_URL = (
  process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:5001"
).replace(/\/$/, "");

// Gateway-backed model calls (synthesis/recommend/pack) can take ~20s, so give
// requests plenty of headroom before aborting.
const TIMEOUT_MS = 120_000;

// Turn a relative backend path ("/api/pack/x", "/api/file/x/0") into an absolute
// URL so links/iframes resolve against the backend, not the Next app origin.
export function absoluteUrl(u?: string | null): string {
  if (!u) return "";
  return u.startsWith("/") ? `${BACKEND_URL}${u}` : u;
}

async function request<T>(path: string, init: RequestInit): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${BACKEND_URL}${path}`, { ...init, signal: controller.signal });
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      throw new Error(body?.error || `${path} -> HTTP ${res.status}`);
    }
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

function postJson<T>(path: string, body: Record<string, unknown>): Promise<T> {
  return request<T>(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function postForm<T>(path: string, form: FormData): Promise<T> {
  // No Content-Type header — the browser sets the multipart boundary.
  return request<T>(path, { method: "POST", body: form });
}

export interface ClarifyResponse {
  question: string;
  answer: string;
}

export const api = {
  // Intake & clarify are multipart so documents upload alongside text.
  intake(transcript: string, files: File[] = []): Promise<IntakeResult> {
    const fd = new FormData();
    fd.append("transcript", transcript);
    files.forEach((f) => fd.append("files", f));
    return postForm<IntakeResult>("/api/intake", fd);
  },

  clarify(
    caseId: string,
    responses: ClarifyResponse[],
    files: File[] = [],
  ): Promise<ClarifyResult> {
    const fd = new FormData();
    fd.append("case_id", caseId);
    fd.append("responses", JSON.stringify(responses));
    files.forEach((f) => fd.append("files", f));
    return postForm<ClarifyResult>("/api/clarify", fd);
  },

  extractEntities: (case_id: string) =>
    postJson<EntitiesResult>("/api/extract-entities", { case_id }),

  connectGmail: (case_id: string) =>
    postJson<GmailResult>("/api/connect-gmail", { case_id }),

  gmailDraft: (case_id: string, email: { to: string; subject: string; body: string }) =>
    postJson<GmailDraftResult>("/api/gmail/draft", { case_id, ...email }),

  async synthesize(case_id: string): Promise<SynthesisResult> {
    const r = await postJson<SynthesisResult>("/api/synthesize", { case_id });
    // Evidence links come back relative to the backend; make them absolute.
    r.key_evidence?.forEach((e) => {
      if (e.href) e.href = absoluteUrl(e.href);
    });
    return r;
  },

  recommend: (case_id: string) =>
    postJson<RecommendResult>("/api/recommend", { case_id }),

  async generatePack(case_id: string): Promise<PackResult> {
    const r = await postJson<PackResult>("/api/generate-pack", { case_id });
    return { pack_url: absoluteUrl(r.pack_url), emails: r.emails ?? [] };
  },
};

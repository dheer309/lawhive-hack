// Thin client for the teammate's CasePilot Flask backend. Calls go directly to
// the backend (CORS is enabled there). Override the host with
// NEXT_PUBLIC_BACKEND_URL; defaults to the Flask dev port.

import type {
  EntitiesResult,
  GmailResult,
  IntakeResult,
  PackResult,
  RecommendResult,
  SynthesisResult,
} from "./types";

export const BACKEND_URL = (
  process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:5001"
).replace(/\/$/, "");

async function post<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const res = await fetch(`${BACKEND_URL}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`${path} -> HTTP ${res.status}`);
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

export const api = {
  intake: (transcript: string, files: string[] = []) =>
    post<IntakeResult>("/api/intake", { transcript, files }),
  extractEntities: (case_id: string) =>
    post<EntitiesResult>("/api/extract-entities", { case_id }),
  connectGmail: (case_id: string) =>
    post<GmailResult>("/api/connect-gmail", { case_id }),
  synthesize: (case_id: string) =>
    post<SynthesisResult>("/api/synthesize", { case_id }),
  recommend: (case_id: string) =>
    post<RecommendResult>("/api/recommend", { case_id }),
  generatePack: (case_id: string) =>
    post<PackResult>("/api/generate-pack", { case_id }),
};

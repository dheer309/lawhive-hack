// The 6 CasePilot backend stages. Each is rendered as an agent working a
// section of the case board. Shapes mirror the live Flask backend.

export type StageId =
  | "intake"
  | "entities"
  | "gmail"
  | "synthesis"
  | "recommend"
  | "pack";

// One thing the intake agent still needs. `confirm` carries an inferred `value`
// the user accepts with one tap; `question` is free text; `document` is a file.
export interface IntakeRequest {
  kind: "question" | "confirm" | "document";
  label: string;
  why: string;
  value?: string;
}

export interface IntakeResult {
  case_id: string;
  summary: string;
  ready?: boolean;
  requests?: IntakeRequest[];
}

export interface ClarifyResult {
  summary: string;
  ready: boolean;
  requests: IntakeRequest[];
}

export interface EntitiesResult {
  names: string[];
  dates: string[];
  keywords: string[];
  addresses: string[];
}

export interface GmailEmail {
  subject: string;
  from: string;
  date: string;
}

export interface GmailResult {
  status: string; // "connected" | "needs_auth" | "error"
  emails_found?: number;
  configured?: boolean;
  auth_url?: string;
  results?: GmailEmail[];
  error?: string;
}

export interface EvidenceItem {
  id?: string;
  source: string;
  detail: string;
  corroborated?: boolean;
  href?: string;
}

export interface ChronologyItem {
  date: string;
  event: string;
  evidence_ids?: string[];
}

export interface Legislation {
  title: string;
  provision?: string;
  relevance?: string;
  url?: string | null;
}

export interface SynthesisResult {
  chronology: ChronologyItem[];
  key_evidence: EvidenceItem[];
  analysis?: string;
  case_summary?: string; // legacy field name (demo replay)
  legislation?: Legislation[];
}

export interface CheckItem {
  label: string;
  status: "pass" | "attention" | "fail" | "unknown";
  note: string;
}

export interface RecommendResult {
  recommendation: string; // pursue_without_lawyer | pursue_with_lawyer | do_not_pursue
  confidence: string; // high | medium | low
  reasoning: string;
  route_primary?: string;
  route_backstop?: string;
  route_avoid?: string;
  checks?: CheckItem[];
  time_limit?: string;
  next_steps?: string[];
}

export interface PackResult {
  pack_url: string;
}

export interface StageResults {
  intake?: IntakeResult;
  entities?: EntitiesResult;
  gmail?: GmailResult;
  synthesis?: SynthesisResult;
  recommend?: RecommendResult;
  pack?: PackResult;
}

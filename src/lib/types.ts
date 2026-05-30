// The 6 CasePilot backend stages. Each is rendered as an agent working a
// section of the case board.

export type StageId =
  | "intake"
  | "entities"
  | "gmail"
  | "synthesis"
  | "recommend"
  | "pack";

export interface IntakeResult {
  case_id: string;
  summary: string;
}

export interface EntitiesResult {
  names: string[];
  dates: string[];
  keywords: string[];
  addresses: string[];
}

export interface GmailResult {
  status: string;
  emails_found: number;
}

export interface SynthesisResult {
  chronology: { date: string; event: string }[];
  key_evidence: { source: string; detail: string }[];
  case_summary: string;
}

export interface RecommendResult {
  // e.g. "pursue_without_lawyer" | "pursue_with_lawyer" | "do_not_pursue"
  recommendation: string;
  confidence: string; // "high" | "medium" | "low"
  reasoning: string;
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

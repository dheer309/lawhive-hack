// Client-safe metadata for the firm's cast — one agent per CasePilot stage.

import type { StageId } from "./types";

export interface AgentMeta {
  id: StageId;
  name: string; // the character's name — gives the firm a cast
  title: string; // their job at the firm
  blurb: string; // one-line "what I do"
  working: string; // present-continuous status shown while active
  accent: string; // hex accent colour
}

export const AGENTS: AgentMeta[] = [
  {
    id: "intake",
    name: "Pam",
    title: "Reception",
    blurb: "Takes your story and works out what kind of case this is.",
    working: "Listening and sorting the case type…",
    accent: "#c9f24d",
  },
  {
    id: "entities",
    name: "Dwight",
    title: "Investigator",
    blurb: "Pulls out the names, dates, keywords and addresses that matter.",
    working: "Extracting the key facts…",
    accent: "#7dd3fc",
  },
  {
    id: "gmail",
    name: "Angela",
    title: "Evidence",
    blurb: "Connects your inbox and finds the emails that prove the story.",
    working: "Connecting your inbox and searching…",
    accent: "#fca5a5",
  },
  {
    id: "synthesis",
    name: "Jim",
    title: "Synthesis",
    blurb: "Builds a sourced timeline and pulls together the key evidence.",
    working: "Building the timeline and evidence…",
    accent: "#fcd34d",
  },
  {
    id: "recommend",
    name: "Michael",
    title: "Counsel",
    blurb: "Gives the verdict: pursue with a lawyer, without, or not at all.",
    working: "Weighing the merits…",
    accent: "#f0abfc",
  },
  {
    id: "pack",
    name: "Oscar",
    title: "Clerk",
    blurb: "Assembles your case pack, ready to use or hand to a lawyer.",
    working: "Assembling your case pack…",
    accent: "#86efac",
  },
];

export const AGENT_MAP = Object.fromEntries(
  AGENTS.map((a) => [a.id, a]),
) as Record<StageId, AgentMeta>;

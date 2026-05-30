// CasePilot agent stage — pixel-art animation host.
//
// OWNED BY: strategy consultant. This is the only contract you need:
//   props.stage  ->  one of:
//     "idle" | "extracting" | "searching" | "synthesising" | "recommending" | "packing"
//
// Drop your animated pixel-art characters in below. Do NOT add other props or
// reach into the rest of the app — keep this component self-contained so it can
// be developed in isolation. The placeholder below just renders the stage name.

const LABELS = {
  idle: "Agents standing by…",
  extracting: "Reading your story, pulling out names & dates",
  searching: "Digging through your inbox for evidence",
  synthesising: "Building the chronology & evidence map",
  recommending: "Weighing up your options",
  packing: "Assembling your case pack",
};

export default function AgentView({ stage = "idle" }) {
  const active = stage !== "idle";
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-white/10 bg-black/40 py-8">
      <div
        className={`flex h-16 w-16 items-center justify-center rounded-lg bg-indigo-500/10 text-3xl ${
          active ? "animate-bounce" : ""
        }`}
      >
        🕵️
      </div>
      <p className="font-pixel text-[10px] leading-relaxed text-indigo-300">
        {(stage || "idle").toUpperCase()}
      </p>
      <p className="text-xs text-gray-500">{LABELS[stage] || LABELS.idle}</p>
    </div>
  );
}

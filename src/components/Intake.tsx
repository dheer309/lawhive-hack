"use client";

import { useEffect, useRef, useState } from "react";
import { HERO_DOC_NAMES, HERO_TRANSCRIPT } from "@/lib/case-data";

// Minimal typing for the Web Speech API (not in lib.dom).
type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onend: (() => void) | null;
};

function getRecognition(): SpeechRecognitionLike | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  };
  const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
  return Ctor ? new Ctor() : null;
}

export function Intake({
  onStart,
  onReplay,
}: {
  onStart: (transcript: string) => void;
  onReplay?: () => void;
}) {
  const [text, setText] = useState("");
  const [listening, setListening] = useState(false);
  const [voiceOk, setVoiceOk] = useState(false);
  const recRef = useRef<SpeechRecognitionLike | null>(null);
  const baseRef = useRef("");

  useEffect(() => {
    setVoiceOk(getRecognition() !== null);
  }, []);

  function toggleVoice() {
    if (listening) {
      recRef.current?.stop();
      return;
    }
    const rec = getRecognition();
    if (!rec) return;
    recRef.current = rec;
    baseRef.current = text ? text + " " : "";
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = "en-GB";
    rec.onresult = (e) => {
      let s = "";
      for (let i = 0; i < e.results.length; i++) s += e.results[i][0].transcript;
      setText(baseRef.current + s);
    };
    rec.onend = () => setListening(false);
    rec.start();
    setListening(true);
  }

  const docCount = HERO_DOC_NAMES.length;

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-2xl flex-col justify-center px-5 py-10">
      <div className="mb-1 flex items-center gap-2">
        <span className="grid h-7 w-7 place-items-center rounded-md bg-lime text-sm font-black text-ink">F</span>
        <span className="label text-muted">The Firm · Lawhive Hackathon</span>
      </div>
      <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
        Your pocket law firm.
      </h1>
      <p className="mt-3 max-w-xl text-base text-muted">
        Tell us what happened — in your own words, by voice or text. A team of AI
        specialists will work your case in front of you and hand you a real next step.
      </p>

      <div className="mt-7 rounded-2xl border border-ink-line bg-ink-soft/70 p-3">
        <div className="relative">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="e.g. My letting agent kept my whole deposit and I don't think it's fair…"
            rows={5}
            className="w-full resize-none rounded-xl bg-transparent p-3 text-[15px] leading-relaxed text-paper placeholder:text-muted/60 focus:outline-none"
          />
          {voiceOk && (
            <button
              onClick={toggleVoice}
              className={`absolute bottom-2 right-2 flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                listening ? "bg-lime text-ink" : "bg-ink text-paper hover:bg-ink-line"
              }`}
            >
              <span className={`h-2 w-2 rounded-full ${listening ? "working-dot bg-ink" : "bg-lime"}`} />
              {listening ? "Listening… stop" : "Speak"}
            </button>
          )}
        </div>

        {/* the "dumped" documents — pre-attached for the demo */}
        <div className="mt-2 flex flex-wrap items-center gap-1.5 px-1 pb-1">
          <span className="label text-muted">Attached</span>
          {HERO_DOC_NAMES.map((name) => (
            <span key={name} className="rounded-md bg-ink px-2 py-1 text-xs text-paper/70">
              📄 {name}
            </span>
          ))}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          onClick={() => onStart(text.trim() || HERO_TRANSCRIPT)}
          className="rounded-xl bg-lime px-5 py-3 text-sm font-bold text-ink transition hover:bg-lime-deep"
        >
          Start the firm →
        </button>
        <button
          onClick={() => setText(HERO_TRANSCRIPT)}
          className="rounded-xl border border-ink-line px-4 py-3 text-sm font-medium text-paper/80 transition hover:bg-ink-soft"
        >
          Use the demo case
        </button>
        <span className="label ml-auto text-muted">{docCount} files ready</span>
      </div>

      {onReplay && (
        <button
          onClick={onReplay}
          className="mt-3 self-start text-xs text-muted underline decoration-dotted underline-offset-4 transition hover:text-paper"
        >
          No API key? Watch the worked demo →
        </button>
      )}
    </div>
  );
}

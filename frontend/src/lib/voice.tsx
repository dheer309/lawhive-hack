"use client";

import { useEffect, useRef, useState } from "react";

// Minimal typing for the Web Speech API (not in lib.dom).
export type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onend: (() => void) | null;
};

export function getRecognition(): SpeechRecognitionLike | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  };
  const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
  return Ctor ? new Ctor() : null;
}

// Compact mic button for dictating into a field. Calls onText with the spoken
// text when the user stops. Renders nothing if the browser has no speech API.
export function DictateButton({ onText }: { onText: (t: string) => void }) {
  const [listening, setListening] = useState(false);
  const [supported, setSupported] = useState(false);
  const recRef = useRef<SpeechRecognitionLike | null>(null);
  const accRef = useRef("");

  useEffect(() => setSupported(getRecognition() !== null), []);

  function toggle() {
    if (listening) {
      recRef.current?.stop();
      return;
    }
    const rec = getRecognition();
    if (!rec) return;
    recRef.current = rec;
    accRef.current = "";
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = "en-GB";
    rec.onresult = (e) => {
      let s = "";
      for (let i = 0; i < e.results.length; i++) s += e.results[i][0].transcript;
      accRef.current = s;
    };
    rec.onend = () => {
      setListening(false);
      if (accRef.current.trim()) onText(accRef.current.trim());
    };
    rec.start();
    setListening(true);
  }

  if (!supported) return null;
  return (
    <button
      type="button"
      onClick={toggle}
      title="Dictate"
      className={`shrink-0 rounded-md px-2 py-1 text-xs font-semibold transition ${
        listening ? "bg-lime text-ink" : "bg-ink text-paper hover:bg-ink-line"
      }`}
    >
      {listening ? "● stop" : "🎙"}
    </button>
  );
}

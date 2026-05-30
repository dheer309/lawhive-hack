import { useState } from "react";
import Stage from "./Stage.jsx";

// Stage 1 — voice/text dump + file upload. Always unlocked.
export default function Intake({ loading, done, summary, onRun }) {
  const [transcript, setTranscript] = useState("");
  const [files, setFiles] = useState([]);

  return (
    <Stage index={1} title="Intake" locked={false} loading={loading} done={done}>
      <p className="mb-3 text-sm text-gray-400">
        Dump everything you know — paste a voice transcript, texts, emails, anything.
      </p>

      <textarea
        value={transcript}
        onChange={(e) => setTranscript(e.target.value)}
        rows={6}
        placeholder="e.g. My landlord won't give back my deposit. I moved out in March…"
        className="w-full resize-none rounded-lg border border-white/10 bg-black/40 p-3 text-sm text-gray-200 outline-none focus:border-indigo-400"
      />

      <label className="mt-3 flex cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-white/15 bg-black/20 py-6 text-sm text-gray-400 hover:border-indigo-400">
        <span>📎 Drop or select files (PDFs, images, texts)</span>
        <input
          type="file"
          multiple
          className="hidden"
          onChange={(e) => setFiles(Array.from(e.target.files).map((f) => f.name))}
        />
        {files.length > 0 && (
          <span className="mt-2 text-xs text-indigo-300">{files.join(", ")}</span>
        )}
      </label>

      <button
        onClick={() => onRun(transcript, files)}
        disabled={loading || (!transcript.trim() && files.length === 0)}
        className="mt-4 w-full rounded-lg bg-indigo-500 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-400 disabled:cursor-not-allowed disabled:opacity-40"
      >
        Start investigation
      </button>

      {summary && (
        <div className="mt-4 rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3 text-sm text-gray-300">
          <span className="font-semibold text-emerald-300">Case opened: </span>
          {summary}
        </div>
      )}
    </Stage>
  );
}

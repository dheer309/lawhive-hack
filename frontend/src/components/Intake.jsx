import { useRef, useState } from "react";
import Stage from "./Stage.jsx";
import { api } from "../api.js";

// A compact record→transcribe button. Calls onText(text) with the transcript.
function DictateButton({ onText }) {
  const [rec, setRec] = useState(false);
  const [busy, setBusy] = useState(false);
  const ref = useRef(null);
  const chunks = useRef([]);

  async function start() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const r = new MediaRecorder(stream);
      chunks.current = [];
      r.ondataavailable = (e) => e.data.size && chunks.current.push(e.data);
      r.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        setBusy(true);
        try {
          const { transcript } = await api.transcribe(new Blob(chunks.current, { type: "audio/webm" }));
          onText(transcript);
        } catch (e) {
          alert(e.message);
        } finally {
          setBusy(false);
        }
      };
      ref.current = r;
      r.start();
      setRec(true);
    } catch {
      alert("Microphone access was denied or is unavailable.");
    }
  }
  function stop() {
    ref.current?.stop();
    setRec(false);
  }

  return (
    <button
      type="button"
      onClick={rec ? stop : start}
      disabled={busy}
      title="Dictate your answer"
      className={`shrink-0 rounded-md border px-2 py-1 text-xs transition ${
        rec ? "border-rose-400 text-rose-300" : "border-white/15 text-gray-300 hover:border-indigo-400"
      } disabled:opacity-50`}
    >
      {busy ? "…" : rec ? "■ Stop" : "🎙️"}
    </button>
  );
}

// Stage 1 — voice/text dump, then an ordered follow-up loop: the agent reads
// any provided documents first, then asks only for what it doesn't already know
// (name → immediately-relevant documents → remaining fact questions). Answers
// can be typed or dictated; documents can be uploaded or searched for in Gmail.
export default function Intake({ loading, done, summary, onWorking, onComplete }) {
  const [transcript, setTranscript] = useState("");
  const [introFiles, setIntroFiles] = useState([]);
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const recorderRef = useRef(null);
  const chunksRef = useRef([]);

  const [phase, setPhase] = useState("intro"); // "intro" | "followup"
  const [caseId, setCaseId] = useState(null);
  const [summaryLocal, setSummaryLocal] = useState("");
  const [requests, setRequests] = useState([]);
  const [ans, setAns] = useState({}); // idx -> { text, file, unavailable }
  const [gmail, setGmail] = useState(null);

  const setText = (i, text) => setAns((a) => ({ ...a, [i]: { ...a[i], text } }));
  const appendText = (i, t) =>
    setAns((a) => ({ ...a, [i]: { ...a[i], text: a[i]?.text ? `${a[i].text} ${t}` : t } }));
  const setConfirm = (i, confirm) => setAns((a) => ({ ...a, [i]: { ...a[i], confirm } }));

  // --- main dump voice ---
  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      chunksRef.current = [];
      rec.ondataavailable = (e) => e.data.size && chunksRef.current.push(e.data);
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        setTranscribing(true);
        try {
          const { transcript: text } = await api.transcribe(
            new Blob(chunksRef.current, { type: "audio/webm" })
          );
          setTranscript((prev) => (prev ? `${prev}\n\n${text}` : text));
        } catch (err) {
          alert(err.message);
        } finally {
          setTranscribing(false);
        }
      };
      recorderRef.current = rec;
      rec.start();
      setRecording(true);
    } catch {
      alert("Microphone access was denied or is unavailable.");
    }
  }
  function stopRecording() {
    recorderRef.current?.stop();
    setRecording(false);
  }

  // --- intake / follow-up loop ---
  async function start() {
    onWorking(true);
    try {
      const res = await api.intake(transcript, introFiles);
      setCaseId(res.case_id);
      setSummaryLocal(res.summary);
      if (res.ready) {
        onComplete({ case_id: res.case_id, summary: res.summary });
      } else {
        setRequests(res.requests);
        setAns({});
        setGmail(null);
        setPhase("followup");
      }
    } catch (err) {
      alert(`Intake failed: ${err.message}`);
    } finally {
      onWorking(false);
    }
  }

  async function submitRound() {
    const responses = [];
    const files = [];
    requests.forEach((r, i) => {
      const a = ans[i] || {};
      if (r.kind === "document") {
        if (a.file) {
          files.push(a.file);
          responses.push({ question: `Document: ${r.label}`, answer: `Provided (uploaded "${a.file.name}")` });
        } else if (a.unavailable) {
          responses.push({
            question: `Document: ${r.label}`,
            answer: `Don't have / can't find${gmail ? " — please search my Gmail to recover it." : ""}`,
          });
        }
      } else if (r.kind === "confirm") {
        const conf = a.confirm ?? "yes"; // untouched = accept the proposed value
        let answer = conf === "yes" ? r.value || "" : (a.text || "").trim();
        if (conf === "no" && !answer) answer = `That's not correct (not "${r.value}").`;
        if (answer) responses.push({ question: r.label, answer });
      } else if ((a.text || "").trim()) {
        responses.push({ question: r.label, answer: a.text.trim() });
      }
    });

    onWorking(true);
    try {
      const res = await api.clarify(caseId, responses, files);
      setSummaryLocal(res.summary);
      if (res.ready) {
        onComplete({ case_id: caseId, summary: res.summary });
      } else {
        setRequests(res.requests);
        setAns({});
        setGmail(null);
      }
    } catch (err) {
      alert(`Clarify failed: ${err.message}`);
    } finally {
      onWorking(false);
    }
  }

  async function searchGmail() {
    onWorking(true);
    try {
      setGmail(await api.connectGmail(caseId));
    } catch (err) {
      alert(`Gmail search failed: ${err.message}`);
    } finally {
      onWorking(false);
    }
  }

  const canStart = transcript.trim() || introFiles.length > 0;
  const hasDocRequests = requests.some((r) => r.kind === "document");

  return (
    <Stage index={1} title="Intake" locked={false} loading={loading} done={done}>
      {done ? (
        <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3 text-sm text-gray-300">
          <span className="font-semibold text-emerald-300">Case opened: </span>
          {summary}
        </div>
      ) : phase === "intro" ? (
        <>
          <p className="mb-3 text-sm text-gray-400">
            Dump everything you know — record a voice memo, or paste texts, emails, anything.
          </p>

          <button
            onClick={recording ? stopRecording : startRecording}
            disabled={transcribing}
            className={`mb-3 flex w-full items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-semibold transition disabled:opacity-50 ${
              recording
                ? "bg-rose-500/90 text-white hover:bg-rose-500"
                : "border border-white/15 bg-black/30 text-gray-200 hover:border-indigo-400"
            }`}
          >
            {transcribing ? (
              "Transcribing…"
            ) : recording ? (
              <>
                <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-white" /> Stop recording
              </>
            ) : (
              <>🎙️ Record a voice memo</>
            )}
          </button>

          <textarea
            value={transcript}
            onChange={(e) => setTranscript(e.target.value)}
            rows={6}
            placeholder="e.g. My landlord won't give back my deposit. I moved out in March…"
            className="w-full resize-none rounded-lg border border-white/10 bg-black/40 p-3 text-sm text-gray-200 outline-none focus:border-indigo-400"
          />

          <label className="mt-3 flex cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-white/15 bg-black/20 py-6 text-sm text-gray-400 hover:border-indigo-400">
            <span>📎 Drop or select files (PDFs, text, emails)</span>
            <input
              type="file"
              multiple
              className="hidden"
              onChange={(e) => setIntroFiles(Array.from(e.target.files))}
            />
            {introFiles.length > 0 && (
              <span className="mt-2 text-xs text-indigo-300">
                {introFiles.map((f) => f.name).join(", ")}
              </span>
            )}
          </label>

          <button
            onClick={start}
            disabled={loading || !canStart}
            className="mt-4 w-full rounded-lg bg-indigo-500 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-400 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Start investigation
          </button>
        </>
      ) : (
        // ordered follow-up requests
        <div className="space-y-4">
          <p className="text-sm text-gray-400">
            A few details will make your case stronger. Type or dictate answers, upload any documents
            you have, and tick anything you can't find.
          </p>

          {requests.map((r, i) => {
            const a = ans[i] || {};
            if (r.kind === "confirm") {
              const conf = a.confirm ?? "yes";
              return (
                <div key={i} className="rounded-lg border border-white/10 bg-black/30 p-3">
                  <p className="text-sm font-medium text-gray-200">{r.label}</p>
                  <p className="mt-0.5 text-sm">
                    <span className="text-gray-500">We have: </span>
                    <span className="font-semibold text-indigo-200">{r.value}</span>
                  </p>
                  <div className="mt-2 flex gap-2">
                    <button
                      onClick={() => setConfirm(i, "yes")}
                      className={`rounded-md border px-3 py-1 text-xs transition ${
                        conf === "yes"
                          ? "border-emerald-400 bg-emerald-500/15 text-emerald-300"
                          : "border-white/15 text-gray-300 hover:border-emerald-400"
                      }`}
                    >
                      ✓ Yes, correct
                    </button>
                    <button
                      onClick={() => setConfirm(i, "no")}
                      className={`rounded-md border px-3 py-1 text-xs transition ${
                        conf === "no"
                          ? "border-rose-400 bg-rose-500/15 text-rose-300"
                          : "border-white/15 text-gray-300 hover:border-rose-400"
                      }`}
                    >
                      ✕ No, change
                    </button>
                  </div>
                  {conf === "no" && (
                    <div className="mt-2 flex items-start gap-2">
                      <textarea
                        value={a.text || ""}
                        onChange={(e) => setText(i, e.target.value)}
                        rows={1}
                        placeholder="The correct answer…"
                        className="w-full resize-none rounded-lg border border-white/10 bg-black/40 p-2.5 text-sm text-gray-200 outline-none focus:border-indigo-400"
                      />
                      <DictateButton onText={(t) => appendText(i, t)} />
                    </div>
                  )}
                </div>
              );
            }
            return r.kind === "document" ? (
              <div key={i} className="rounded-lg border border-white/10 bg-black/30 p-3">
                <p className="text-sm font-medium text-gray-200">📄 {r.label}</p>
                {r.why && <p className="text-xs text-gray-500">{r.why}</p>}
                <div className="mt-2 flex flex-wrap items-center gap-3">
                  <label
                    className={`cursor-pointer rounded-md border border-white/15 px-3 py-1 text-xs transition hover:border-indigo-400 ${
                      a.unavailable ? "pointer-events-none opacity-40" : "text-gray-200"
                    }`}
                  >
                    {a.file ? `✓ ${a.file.name}` : "Upload"}
                    <input
                      type="file"
                      className="hidden"
                      onChange={(e) =>
                        e.target.files[0] &&
                        setAns((s) => ({ ...s, [i]: { file: e.target.files[0], unavailable: false } }))
                      }
                    />
                  </label>
                  <label className="flex items-center gap-1.5 text-xs text-gray-400">
                    <input
                      type="checkbox"
                      checked={!!a.unavailable}
                      onChange={(e) =>
                        setAns((s) => ({ ...s, [i]: { file: null, unavailable: e.target.checked } }))
                      }
                    />
                    I don't have / can't find this
                  </label>
                </div>
              </div>
            ) : (
              <div key={i}>
                <label className="text-sm font-medium text-gray-200">{r.label}</label>
                {r.why && <p className="mb-1 text-xs text-gray-500">{r.why}</p>}
                <div className="flex items-start gap-2">
                  <textarea
                    value={a.text || ""}
                    onChange={(e) => setText(i, e.target.value)}
                    rows={2}
                    className="w-full resize-none rounded-lg border border-white/10 bg-black/40 p-2.5 text-sm text-gray-200 outline-none focus:border-indigo-400"
                  />
                  <DictateButton onText={(t) => appendText(i, t)} />
                </div>
              </div>
            );
          })}

          {hasDocRequests &&
            (gmail ? (
              <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3 text-sm text-gray-300">
                <span className="font-semibold text-emerald-300">✓ Inbox connected</span> — found{" "}
                <span className="font-bold text-white">{gmail.emails_found}</span> relevant emails.
                CasePilot will pull the documents you're missing from your inbox.
              </div>
            ) : (
              <button
                onClick={searchGmail}
                disabled={loading}
                className="flex w-full items-center justify-center gap-2 rounded-lg border border-white/15 bg-black/30 py-2.5 text-sm font-semibold text-gray-200 transition hover:border-indigo-400 disabled:opacity-40"
              >
                🔎 Can't find a document? Search my Gmail for it
              </button>
            ))}

          <div className="flex gap-2">
            <button
              onClick={submitRound}
              disabled={loading}
              className="flex-1 rounded-lg bg-indigo-500 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-400 disabled:opacity-40"
            >
              Submit
            </button>
            <button
              onClick={() => onComplete({ case_id: caseId, summary: summaryLocal })}
              disabled={loading}
              className="rounded-lg border border-white/15 px-4 py-2.5 text-sm text-gray-300 transition hover:border-gray-400 disabled:opacity-40"
            >
              Skip
            </button>
          </div>
        </div>
      )}
    </Stage>
  );
}

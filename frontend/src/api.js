// Thin fetch wrapper. All calls go through Vite's /api proxy to Flask.
async function post(path, body) {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body || {}),
  });
  if (!res.ok) throw new Error(`${path} failed: ${res.status}`);
  return res.json();
}

async function postForm(path, form) {
  const res = await fetch(path, { method: "POST", body: form });
  if (!res.ok) {
    const { error } = await res.json().catch(() => ({}));
    throw new Error(error || `${path} failed: ${res.status}`);
  }
  return res.json();
}

// Send recorded audio to Whisper; returns { transcript }.
function transcribe(blob) {
  const form = new FormData();
  form.append("audio", blob, "recording.webm");
  return postForm("/api/transcribe", form);
}

// intake/clarify are multipart so we can upload document files alongside text.
function intake(transcript, files = []) {
  const form = new FormData();
  form.append("transcript", transcript);
  files.forEach((f) => form.append("files", f));
  return postForm("/api/intake", form);
}

function clarify(case_id, responses, files = []) {
  const form = new FormData();
  form.append("case_id", case_id);
  form.append("responses", JSON.stringify(responses));
  files.forEach((f) => form.append("files", f));
  return postForm("/api/clarify", form);
}

export const api = {
  transcribe,
  intake,
  clarify,
  extractEntities: (case_id) => post("/api/extract-entities", { case_id }),
  connectGmail: (case_id) => post("/api/connect-gmail", { case_id }),
  synthesize: (case_id) => post("/api/synthesize", { case_id }),
  recommend: (case_id) => post("/api/recommend", { case_id }),
  generatePack: (case_id) => post("/api/generate-pack", { case_id }),
};

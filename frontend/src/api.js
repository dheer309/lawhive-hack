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

export const api = {
  intake: (transcript, files) => post("/api/intake", { transcript, files }),
  extractEntities: (case_id) => post("/api/extract-entities", { case_id }),
  connectGmail: (case_id) => post("/api/connect-gmail", { case_id }),
  synthesize: (case_id) => post("/api/synthesize", { case_id }),
  recommend: (case_id) => post("/api/recommend", { case_id }),
  generatePack: (case_id) => post("/api/generate-pack", { case_id }),
};

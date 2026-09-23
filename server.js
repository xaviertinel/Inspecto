const http = require("http");
const fs = require("fs");
const path = require("path");
const os = require("os");

const mobilePhotos = new Map(); // code -> [{id, name, note, src, at, received}]
const lanIp = () => { for (const l of Object.values(os.networkInterfaces())) for (const a of l || []) if (a.family === "IPv4" && !a.internal && !a.address.startsWith("169.254")) return a.address; return "localhost"; };
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, POST, OPTIONS", "Access-Control-Allow-Headers": "content-type" };

const PORT = process.env.PORT || 3000;
const KEY = process.env.ANTHROPIC_API_KEY || process.env.MISTRAL_API_KEY;
const HTML = path.join(__dirname, "inspecto front.html");

if (!KEY) {
  console.error("Cle API manquante. Lancez :  $env:ANTHROPIC_API_KEY=\"sk-ant-...\"  (ou une cle Mistral)  puis  node server.js");
  process.exit(1);
}
const PROVIDER = KEY.startsWith("sk-ant") ? "anthropic" : "mistral";
const MODELS = PROVIDER === "anthropic"
  ? { quick: "claude-haiku-4-5", default: "claude-sonnet-5" }
  : { quick: process.env.MISTRAL_QUICK || "ministral-14b-latest", default: process.env.MISTRAL_DEFAULT || "pixtral-12b-2409" };

function readBody(req, limit = 40 * 1024 * 1024) {
  return new Promise((res, rej) => {
    let size = 0; const chunks = [];
    req.on("data", c => { size += c.length; if (size > limit) { rej(new Error("body too large")); req.destroy(); } else chunks.push(c); });
    req.on("end", () => res(Buffer.concat(chunks)));
    req.on("error", rej);
  });
}
function json(res, status, obj) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", ...CORS });
  res.end(JSON.stringify(obj));
}
function apiError(r, data) {
  const code = r.status === 429 ? "rate_limited" : "api_error";
  const msg = data?.error?.message || data?.message || (typeof data?.error === "string" ? data.error : null) || r.statusText;
  return Object.assign(new Error(msg), { status: r.status === 429 ? 429 : 502, code });
}

async function sample(body) {
  let messages = typeof body.messages === "string" ? [{ role: "user", content: body.messages }] : body.messages;
  if (!Array.isArray(messages) || !messages.length) throw Object.assign(new Error("messages requis"), { status: 400 });
  const images = Array.isArray(body.images) ? body.images : [];
  const model = MODELS[body.modelTier] || MODELS.default;
  const t0 = Date.now();
  let text, usage;

  if (PROVIDER === "anthropic") {
    messages = messages.map(m => ({ role: m.role, content: typeof m.content === "string" ? [{ type: "text", text: m.content }] : m.content }));
    if (images.length) {
      const last = messages[messages.length - 1];
      last.content = [...images.map(i => ({ type: "image", source: { type: "base64", media_type: i.media_type || "image/jpeg", data: i.data } })), ...last.content];
    }
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model, max_tokens: 8000, messages }),
    });
    const data = await r.json();
    if (!r.ok) throw apiError(r, data);
    text = (data.content || []).filter(b => b.type === "text").map(b => b.text).join("");
    usage = `${data.usage?.input_tokens} in / ${data.usage?.output_tokens} out`;
  } else {
    messages = messages.map(m => ({ role: m.role, content: typeof m.content === "string" ? [{ type: "text", text: m.content }] : m.content }));
    if (images.length) {
      const last = messages[messages.length - 1];
      last.content = [...last.content, ...images.map(i => ({ type: "image_url", image_url: `data:${i.media_type || "image/jpeg"};base64,${i.data}` }))];
    }
    const r = await fetch("https://api.mistral.ai/v1/chat/completions", {
      method: "POST",
      headers: { "authorization": "Bearer " + KEY, "content-type": "application/json" },
      body: JSON.stringify({ model, max_tokens: 8000, messages }),
    });
    const data = await r.json();
    if (!r.ok) throw apiError(r, data);
    const c = data.choices?.[0]?.message?.content;
    text = typeof c === "string" ? c : (c || []).map(b => b.text || "").join("");
    usage = `${data.usage?.prompt_tokens} in / ${data.usage?.completion_tokens} out`;
  }
  console.log(`[${model}] ${images.length} img, ${usage}, ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  return { text };
}

async function transcribe(audio, mime, lang) {
  if (PROVIDER !== "mistral") throw Object.assign(new Error("transcription serveur non disponible avec ce fournisseur"), { status: 501, code: "no_transcribe" });
  const fd = new FormData();
  fd.append("file", new Blob([audio], { type: mime || "audio/webm" }), "audio.webm");
  fd.append("model", "voxtral-mini-latest");
  fd.append("timestamp_granularities", "segment");
  if (lang && lang !== "auto") fd.append("language", lang);
  const t0 = Date.now();
  const r = await fetch("https://api.mistral.ai/v1/audio/transcriptions", { method: "POST", headers: { "authorization": "Bearer " + KEY }, body: fd });
  const data = await r.json();
  if (!r.ok) throw apiError(r, data);
  console.log(`[voxtral] lang=${data.language}, ${(data.segments || []).length} segments, ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  return { text: data.text, language: data.language, segments: (data.segments || []).map(s => ({ start: s.start, end: s.end, text: s.text })) };
}

http.createServer(async (req, res) => {
  try {
    if (req.method === "POST" && req.url === "/api/sample") {
      const body = JSON.parse((await readBody(req)).toString("utf8"));
      return json(res, 200, await sample(body));
    }
    if (req.method === "POST" && req.url.startsWith("/api/transcribe")) {
      const q = new URL(req.url, "http://x").searchParams;
      return json(res, 200, await transcribe(await readBody(req), req.headers["content-type"], q.get("lang")));
    }
    if (req.method === "OPTIONS") { res.writeHead(204, CORS); return res.end(); }
    if (req.method === "GET" && req.url === "/api/info") return json(res, 200, { provider: PROVIDER, transcribe: PROVIDER === "mistral", lanUrl: `http://${lanIp()}:${PORT}`, mobile: true });
    const mob = req.url.match(/^\/api\/mobile\/([A-Za-z0-9]{6})\/photos\/?(\?.*)?$/);
    if (mob) {
      const code = mob[1].toUpperCase(); const list = mobilePhotos.get(code) || [];
      if (req.method === "POST") {
        const p = JSON.parse((await readBody(req)).toString("utf8"));
        if (!p?.id || !p?.src) return json(res, 400, { error: "photo invalide" });
        const photo = { id: String(p.id), name: String(p.name || "Photo mobile"), note: String(p.note || ""), src: p.src, at: Number(p.at) || Date.now(), received: Date.now() };
        list.push(photo); mobilePhotos.set(code, list); console.log(`[mobile ${code}] photo recue (${list.length})`);
        return json(res, 200, { ok: true, id: photo.id });
      }
      const q = new URL(req.url, "http://x").searchParams; const since = Number(q.get("since") || 0);
      return json(res, 200, { count: list.length, photos: q.get("meta") === "1" ? [] : list.filter(x => x.received > since) });
    }
    if (req.method === "GET" && (req.url === "/mobile" || req.url.startsWith("/mobile/") || req.url.startsWith("/mobile?"))) {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      return fs.createReadStream(path.join(__dirname, "mobile", "index.html")).pipe(res);
    }
    if (req.method === "GET" && req.url.startsWith("/demo/")) {
      const f = path.join(__dirname, "demo", path.basename(decodeURIComponent(req.url.slice(6).split("?")[0])));
      if (!fs.existsSync(f)) return json(res, 404, { error: "not found" });
      const types = { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".txt": "text/plain; charset=utf-8", ".pdf": "application/pdf", ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document" };
      res.writeHead(200, { "Content-Type": types[path.extname(f).toLowerCase()] || "application/octet-stream" });
      return fs.createReadStream(f).pipe(res);
    }
    if (req.method === "GET" && (req.url === "/" || req.url.startsWith("/?") || req.url.startsWith("/#"))) {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      return fs.createReadStream(HTML).pipe(res);
    }
    json(res, 404, { error: "not found" });
  } catch (e) {
    const cause = e.cause ? ` (${e.cause.code || ""} ${e.cause.message || ""})`.replace(/\s+\)/, ")") : "";
    console.error(e.message + cause);
    json(res, e.status || 500, { error: e.message + cause, code: e.code || "server_error" });
  }
}).listen(PORT, () => console.log(`Inspecto sur http://localhost:${PORT}  (fournisseur IA : ${PROVIDER}, modeles ${MODELS.quick} / ${MODELS.default})\nPage mobile (meme Wi-Fi) : http://${lanIp()}:${PORT}/mobile`));

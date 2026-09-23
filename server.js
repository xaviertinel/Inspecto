const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = process.env.PORT || 3000;
const KEY = process.env.ANTHROPIC_API_KEY;
const HTML = path.join(__dirname, "inspecto front.html");
const MODELS = { quick: "claude-haiku-4-5", default: "claude-sonnet-5" };

if (!KEY) {
  console.error("ANTHROPIC_API_KEY manquante. Lancez :  $env:ANTHROPIC_API_KEY=\"sk-ant-...\"; node server.js");
  process.exit(1);
}

function readBody(req, limit = 25 * 1024 * 1024) {
  return new Promise((res, rej) => {
    let size = 0; const chunks = [];
    req.on("data", c => { size += c.length; if (size > limit) { rej(new Error("body too large")); req.destroy(); } else chunks.push(c); });
    req.on("end", () => res(Buffer.concat(chunks).toString("utf8")));
    req.on("error", rej);
  });
}

function json(res, status, obj) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(obj));
}

async function sample(body) {
  let messages = typeof body.messages === "string" ? [{ role: "user", content: body.messages }] : body.messages;
  if (!Array.isArray(messages) || !messages.length) throw Object.assign(new Error("messages requis"), { status: 400 });
  messages = messages.map(m => ({ role: m.role, content: typeof m.content === "string" ? [{ type: "text", text: m.content }] : m.content }));
  if (Array.isArray(body.images) && body.images.length) {
    const last = messages[messages.length - 1];
    const blocks = body.images.map(i => ({ type: "image", source: { type: "base64", media_type: i.media_type || "image/jpeg", data: i.data } }));
    last.content = [...blocks, ...last.content];
  }
  const model = MODELS[body.modelTier] || MODELS.default;
  const t0 = Date.now();
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model, max_tokens: 8000, messages }),
  });
  const data = await r.json();
  if (!r.ok) {
    const code = r.status === 429 ? "rate_limited" : "api_error";
    throw Object.assign(new Error(data?.error?.message || r.statusText), { status: r.status === 429 ? 429 : 502, code });
  }
  const text = (data.content || []).filter(b => b.type === "text").map(b => b.text).join("");
  console.log(`[${model}] ${body.images?.length || 0} img, ${data.usage?.input_tokens} in / ${data.usage?.output_tokens} out, ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  return { text };
}

http.createServer(async (req, res) => {
  try {
    if (req.method === "POST" && req.url === "/api/sample") {
      const body = JSON.parse(await readBody(req));
      return json(res, 200, await sample(body));
    }
    if (req.method === "GET" && (req.url === "/" || req.url.startsWith("/?") || req.url.startsWith("/#"))) {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      return fs.createReadStream(HTML).pipe(res);
    }
    json(res, 404, { error: "not found" });
  } catch (e) {
    console.error(e.message);
    json(res, e.status || 500, { error: e.message, code: e.code || "server_error" });
  }
}).listen(PORT, () => console.log(`Inspecto sur http://localhost:${PORT}`));

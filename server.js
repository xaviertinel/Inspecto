const http = require("http");
const fs = require("fs");
const path = require("path");
const os = require("os");
const { createProvider } = require("./lib/ai");

const PORT = process.env.PORT || 3000;
const HTML = path.join(__dirname, "inspecto front.html");
const ai = createProvider(process.env);
if (ai.provider === "none") console.warn("Aucune cle API : le serveur sert l'application et le relais photos, sans IA.");

const mobilePhotos = new Map(); // code -> [{id, name, note, src, at, received}]
const lanIp = () => { for (const l of Object.values(os.networkInterfaces())) for (const a of l || []) if (a.family === "IPv4" && !a.internal && !a.address.startsWith("169.254")) return a.address; return "localhost"; };
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, POST, OPTIONS", "Access-Control-Allow-Headers": "content-type" };

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

http.createServer(async (req, res) => {
  try {
    if (req.method === "OPTIONS") { res.writeHead(204, CORS); return res.end(); }
    if (req.method === "POST" && req.url === "/api/sample") {
      const body = JSON.parse((await readBody(req)).toString("utf8"));
      return json(res, 200, await ai.sample(body, console.log));
    }
    if (req.method === "POST" && req.url.startsWith("/api/transcribe")) {
      const q = new URL(req.url, "http://x").searchParams;
      return json(res, 200, await ai.transcribe(await readBody(req), req.headers["content-type"], q.get("lang"), console.log));
    }
    if (req.method === "GET" && req.url === "/api/info") return json(res, 200, { ...ai.info(), lanUrl: `http://${lanIp()}:${PORT}`, mobile: true });
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
}).listen(PORT, () => console.log(`Inspecto sur http://localhost:${PORT}  (fournisseur IA : ${ai.provider}, modeles ${ai.models.quick} / ${ai.models.default})\nPage mobile (meme Wi-Fi) : http://${lanIp()}:${PORT}/mobile`));

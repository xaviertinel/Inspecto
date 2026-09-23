import { getStore } from "@netlify/blobs";

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, OPTIONS",
  "access-control-allow-headers": "content-type",
};
const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8", ...CORS } });

export default async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  const url = new URL(req.url);
  const m = url.pathname.match(/\/api\/mobile\/([A-Z0-9]{6})\/photos\/?$/i);
  if (!m) return json(404, { error: "not found" });
  const code = m[1].toUpperCase();
  const store = getStore("inspecto-mobile");

  if (req.method === "POST") {
    let p; try { p = await req.json(); } catch { return json(400, { error: "json attendu" }); }
    if (!p?.id || !p?.src || String(p.src).length > 3_000_000) return json(400, { error: "photo invalide" });
    const photo = { id: String(p.id), name: String(p.name || "Photo mobile"), note: String(p.note || ""), src: p.src, at: Number(p.at) || Date.now(), received: Date.now() };
    await store.setJSON(`${code}/${photo.received}-${photo.id}`, photo);
    return json(200, { ok: true, id: photo.id });
  }

  if (req.method === "GET") {
    const since = Number(url.searchParams.get("since") || 0);
    const meta = url.searchParams.get("meta") === "1";
    const { blobs } = await store.list({ prefix: code + "/" });
    const keys = blobs.map(b => b.key).filter(k => Number(k.slice(code.length + 1).split("-")[0]) > since).sort();
    if (meta) return json(200, { count: blobs.length, photos: [] });
    const photos = await Promise.all(keys.map(k => store.get(k, { type: "json" })));
    return json(200, { count: blobs.length, photos: photos.filter(Boolean) });
  }
  return json(405, { error: "method" });
};

export const config = { path: "/api/mobile/*" };

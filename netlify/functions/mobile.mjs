import { getStore } from "@netlify/blobs";

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, DELETE, OPTIONS",
  "access-control-allow-headers": "content-type",
};
const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8", ...CORS } });

export default async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  const url = new URL(req.url);
  const m = url.pathname.match(/\/api\/mobile\/([A-Z0-9]{6})\/photos(?:\/([\w-]+))?\/?$/i);
  if (!m) return json(404, { error: "not found" });
  const code = m[1].toUpperCase(); const photoId = m[2];
  const store = getStore({ name: "inspecto-mobile", consistency: "strong" });

  if (req.method === "DELETE" && photoId) {
    const { blobs } = await store.list({ prefix: code + "/p/" });
    await Promise.all(blobs.filter(b => b.key.endsWith("-" + photoId)).map(b => store.delete(b.key)));
    await store.setJSON(`${code}/d/${Date.now()}-${photoId}`, { id: photoId, at: Date.now() });
    return json(200, { ok: true });
  }

  if (req.method === "POST") {
    let p; try { p = await req.json(); } catch { return json(400, { error: "json attendu" }); }
    if (!p?.id || !p?.src || String(p.src).length > 3_000_000) return json(400, { error: "photo invalide" });
    const photo = { id: String(p.id), name: String(p.name || "Photo mobile"), note: String(p.note || ""), src: p.src, at: Number(p.at) || Date.now(), received: Date.now() };
    await store.setJSON(`${code}/p/${photo.received}-${photo.id}`, photo);
    return json(200, { ok: true, id: photo.id });
  }

  if (req.method === "GET") {
    const since = Number(url.searchParams.get("since") || 0);
    const meta = url.searchParams.get("meta") === "1";
    const { blobs } = await store.list({ prefix: code + "/" });
    const stamp = (k) => Number(k.split("/")[2].split("-")[0]);
    const photoKeys = blobs.map(b => b.key).filter(k => k.includes("/p/")).filter(k => stamp(k) > since).sort();
    const deleted = blobs.map(b => b.key).filter(k => k.includes("/d/")).filter(k => stamp(k) > since).map(k => ({ id: k.split("/")[2].split("-").slice(1).join("-"), at: stamp(k) }));
    const count = blobs.filter(b => b.key.includes("/p/")).length;
    if (meta) return json(200, { count, photos: [], deleted });
    const photos = await Promise.all(photoKeys.map(k => store.get(k, { type: "json" })));
    return json(200, { count, photos: photos.filter(Boolean), deleted });
  }
  return json(405, { error: "method" });
};

export const config = { path: "/api/mobile/*" };

import { createProvider } from "../../lib/ai.js";

const CORS = { "access-control-allow-origin": "*", "access-control-allow-methods": "GET, POST, OPTIONS", "access-control-allow-headers": "content-type" };
const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8", ...CORS } });
const ai = createProvider(process.env);

export default async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  const url = new URL(req.url);
  try {
    if (url.pathname === "/api/info") return json(200, { ...ai.info(), mobile: true });
    if (url.pathname === "/api/sample" && req.method === "POST") return json(200, await ai.sample(await req.json(), console.log));
    if (url.pathname === "/api/transcribe" && req.method === "POST") {
      const buf = Buffer.from(await req.arrayBuffer());
      return json(200, await ai.transcribe(buf, req.headers.get("content-type"), url.searchParams.get("lang"), console.log));
    }
    return json(404, { error: "not found" });
  } catch (e) {
    console.error(e.message, e.cause?.code || "");
    return json(e.status || 500, { error: e.message, code: e.code || "server_error" });
  }
};

export const config = { path: ["/api/info", "/api/sample", "/api/transcribe"] };

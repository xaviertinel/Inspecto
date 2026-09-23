// Fournisseur IA (Anthropic ou Mistral, choisi d'après le préfixe de la clé). Utilisé par server.js et les Netlify Functions.
function apiError(status, data, statusText) {
  const code = status === 429 ? "rate_limited" : "api_error";
  const msg = data?.error?.message || data?.message || data?.detail || (typeof data?.error === "string" ? data.error : null) || statusText || "erreur API";
  return Object.assign(new Error(msg), { status: status === 429 ? 429 : 502, code });
}

function createProvider(env = process.env) {
  const KEY = env.ANTHROPIC_API_KEY || env.MISTRAL_API_KEY || "";
  const provider = !KEY ? "none" : KEY.startsWith("sk-ant") ? "anthropic" : "mistral";
  const models = provider === "anthropic"
    ? { quick: env.ANTHROPIC_QUICK || "claude-haiku-4-5", default: env.ANTHROPIC_DEFAULT || "claude-sonnet-5" }
    : provider === "mistral" ? { quick: env.MISTRAL_QUICK || "ministral-14b-latest", default: env.MISTRAL_DEFAULT || "pixtral-12b-2409" }
    : { quick: "-", default: "-" };

  async function sample(body, log = () => {}) {
    if (provider === "none") throw Object.assign(new Error("IA non configurée : définissez MISTRAL_API_KEY ou ANTHROPIC_API_KEY."), { status: 503, code: "unavailable" });
    let messages = typeof body.messages === "string" ? [{ role: "user", content: body.messages }] : body.messages;
    if (!Array.isArray(messages) || !messages.length) throw Object.assign(new Error("messages requis"), { status: 400, code: "bad_request" });
    const images = Array.isArray(body.images) ? body.images : [];
    const model = models[body.modelTier] || models.default;
    const t0 = Date.now();
    messages = messages.map(m => ({ role: m.role, content: typeof m.content === "string" ? [{ type: "text", text: m.content }] : m.content }));
    let text, usage;
    if (provider === "anthropic") {
      if (images.length) { const last = messages[messages.length - 1]; last.content = [...images.map(i => ({ type: "image", source: { type: "base64", media_type: i.media_type || "image/jpeg", data: i.data } })), ...last.content]; }
      const r = await fetch("https://api.anthropic.com/v1/messages", { method: "POST", headers: { "x-api-key": KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" }, body: JSON.stringify({ model, max_tokens: 8000, messages }) });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw apiError(r.status, data, r.statusText);
      text = (data.content || []).filter(b => b.type === "text").map(b => b.text).join("");
      usage = `${data.usage?.input_tokens} in / ${data.usage?.output_tokens} out`;
    } else {
      if (images.length) { const last = messages[messages.length - 1]; last.content = [...last.content, ...images.map(i => ({ type: "image_url", image_url: `data:${i.media_type || "image/jpeg"};base64,${i.data}` }))]; }
      const r = await fetch("https://api.mistral.ai/v1/chat/completions", { method: "POST", headers: { authorization: "Bearer " + KEY, "content-type": "application/json" }, body: JSON.stringify({ model, max_tokens: 8000, messages }) });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw apiError(r.status, data, r.statusText);
      const c = data.choices?.[0]?.message?.content;
      text = typeof c === "string" ? c : (c || []).map(b => b.text || "").join("");
      usage = `${data.usage?.prompt_tokens} in / ${data.usage?.completion_tokens} out`;
    }
    log(`[${model}] ${images.length} img, ${usage}, ${((Date.now() - t0) / 1000).toFixed(1)}s`);
    return { text };
  }

  async function transcribe(audio, mime, lang, log = () => {}) {
    if (provider !== "mistral") throw Object.assign(new Error("transcription audio disponible uniquement avec une clé Mistral (Voxtral)"), { status: 501, code: "no_transcribe" });
    const fd = new FormData();
    fd.append("file", new Blob([audio], { type: mime || "audio/webm" }), "audio.webm");
    fd.append("model", env.MISTRAL_TRANSCRIBE || "voxtral-mini-latest");
    fd.append("timestamp_granularities", "segment");
    if (lang && lang !== "auto") fd.append("language", lang);
    const t0 = Date.now();
    const r = await fetch("https://api.mistral.ai/v1/audio/transcriptions", { method: "POST", headers: { authorization: "Bearer " + KEY }, body: fd });
    const txt = await r.text(); let data; try { data = JSON.parse(txt); } catch { data = { message: txt.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 160) }; }
    if (!r.ok) throw apiError(r.status, data, r.statusText);
    log(`[voxtral] lang=${data.language}, ${(data.segments || []).length} segments, ${((Date.now() - t0) / 1000).toFixed(1)}s`);
    return { text: data.text, language: data.language, segments: (data.segments || []).map(s => ({ start: s.start, end: s.end, text: s.text })) };
  }

  const info = () => ({ provider, transcribe: provider === "mistral", models: provider === "none" ? null : models });
  return { provider, models, sample, transcribe, info };
}

module.exports = { createProvider };

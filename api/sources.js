const {
  assertSyncToken,
  methodNotAllowed,
  safeText,
  sendJson,
  supabaseRequest,
} = require("./lib/supabase");

module.exports = async function handler(req, res) {
  if (req.method === "PATCH") return updateSource(req, res);
  if (req.method !== "GET") return methodNotAllowed(res);

  try {
    const sources = await supabaseRequest("/sources?select=*,devices(name)&order=last_sync_at.desc.nullslast");
    return sendJson(res, 200, sources);
  } catch (error) {
    return sendJson(res, error.statusCode || 500, { error: error.message });
  }
};

async function updateSource(req, res) {
  try {
    assertSyncToken(req);

    const sourceId = safeText(req.body?.sourceId, 80);
    const pathLabel = String(req.body?.pathLabel || "").trim().slice(0, 300);
    if (!sourceId) return sendJson(res, 400, { error: "Missing sourceId" });

    const updated = await supabaseRequest(`/sources?id=eq.${encodeURIComponent(sourceId)}&select=*`, {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({ path_label: pathLabel }),
    });
    return sendJson(res, 200, updated[0] || null);
  } catch (error) {
    return sendJson(res, error.statusCode || 500, { error: error.message });
  }
}

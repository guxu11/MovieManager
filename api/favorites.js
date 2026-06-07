const {
  methodNotAllowed,
  safeText,
  sendJson,
  supabaseRequest,
} = require("./lib/supabase");

const SELECT = "*,sources(name,path_label,last_sync_at,devices(name))";

module.exports = async function handler(req, res) {
  if (req.method === "GET") return listFavorites(res);
  if (req.method === "PATCH") return updateFavorite(req, res);
  return methodNotAllowed(res);
};

async function listFavorites(res) {
  try {
    const rows = await supabaseRequest(
      `/files?is_favorite=eq.true&select=${SELECT}&order=last_seen_at.desc&limit=200`
    );
    return sendJson(res, 200, rows);
  } catch (error) {
    return sendJson(res, error.statusCode || 500, { error: error.message });
  }
}

async function updateFavorite(req, res) {
  try {
    const fileId = safeText(req.body?.fileId, 80);
    const isFavorite = Boolean(req.body?.isFavorite);
    if (!fileId) return sendJson(res, 400, { error: "Missing fileId" });

    const updated = await supabaseRequest(`/files?id=eq.${encodeURIComponent(fileId)}&select=${SELECT}`, {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({ is_favorite: isFavorite }),
    });
    return sendJson(res, 200, updated[0] || null);
  } catch (error) {
    return sendJson(res, error.statusCode || 500, { error: error.message });
  }
}

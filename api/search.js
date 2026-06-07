const {
  methodNotAllowed,
  normalizeCode,
  safeText,
  sendJson,
  supabaseRequest,
} = require("./lib/supabase");

module.exports = async function handler(req, res) {
  if (req.method !== "GET") return methodNotAllowed(res);

  try {
    const query = safeText(req.query.q, 120);
    if (!query) return sendJson(res, 400, { error: "Missing query" });

    const select = "*,sources(name,path_label,last_sync_at,devices(name))";
    const code = normalizeCode(query);
    if (code) {
      const exact = await supabaseRequest(
        `/files?code=eq.${encodeURIComponent(code)}&select=${select}&order=last_seen_at.desc&limit=80`
      );
      if (exact.length) return sendJson(res, 200, exact);
    }

    const tokens = queryTokens(query);
    const token = tokens.compact || tokens.parts[0] || query;
    const rows = await supabaseRequest(
      `/files?filename=ilike.*${encodeURIComponent(token)}*&select=${select}&order=last_seen_at.desc&limit=80`
    );
    return sendJson(res, 200, filterByTokens(rows, tokens));
  } catch (error) {
    return sendJson(res, error.statusCode || 500, { error: error.message });
  }
};

function queryTokens(query) {
  const parts = String(query).toLowerCase().split(/[\s._-]+/).filter(Boolean);
  const compact = parts.join("");
  return { compact, parts: parts.slice(0, 4) };
}

function filterByTokens(rows, tokens) {
  if (!tokens.compact && !tokens.parts.length) return rows;
  return rows.filter((row) => {
    const filename = String(row.filename || "").toLowerCase();
    if (tokens.compact && filename.includes(tokens.compact)) return true;
    return tokens.parts.length > 0 && tokens.parts.every((token) => filename.includes(token));
  });
}

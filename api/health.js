const {
  methodNotAllowed,
  sendJson,
  supabaseRequest,
} = require("./lib/supabase");

module.exports = async function handler(req, res) {
  if (req.method !== "GET") return methodNotAllowed(res);

  try {
    await supabaseRequest("/devices?select=id&limit=1");
    return sendJson(res, 200, { ok: true });
  } catch (error) {
    return sendJson(res, error.statusCode || 500, { ok: false, error: error.message });
  }
};

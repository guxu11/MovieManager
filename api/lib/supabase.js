const CHUNK_SIZE = 500;
const MAX_FILES_PER_SYNC = 30000;
const VIDEO_SUFFIXES = new Set(["mp4", "ts", "mkv", "avi", "mov", "wmv", "flv", "m4v"]);

function requireEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing environment variable: ${name}`);
  return value;
}

function supabaseBaseUrl() {
  return `${requireEnv("SUPABASE_URL").replace(/\/$/, "")}/rest/v1`;
}

function serviceHeaders(extra = {}) {
  const key = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
    ...extra,
  };
}

async function supabaseRequest(path, options = {}) {
  const response = await fetch(`${supabaseBaseUrl()}${path}`, {
    ...options,
    headers: serviceHeaders(options.headers || {}),
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(body || `${response.status} ${response.statusText}`);
  }
  const body = await response.text();
  if (!body) return null;
  return JSON.parse(body);
}

function sendJson(res, status, body) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.status(status).send(JSON.stringify(body));
}

function methodNotAllowed(res) {
  sendJson(res, 405, { error: "Method not allowed" });
}

function safeText(value, maxLength) {
  const text = String(value || "").trim();
  if (!text || text.length > maxLength) return null;
  return text;
}

function isVideoFile(filename) {
  return VIDEO_SUFFIXES.has(videoExtension(filename));
}

function extractCode(filename) {
  const base = String(filename || "").trim().replace(/[?？\s]+$/u, "").replace(/\.[^.]+$/, "");
  const match = base.match(/(?:^|[^a-z0-9])([a-z]{2,8})[\s._-]*0*([0-9]{2,6})(?:[^a-z0-9]|$)/i)
    || base.match(/^([a-z]{2,8})0*([0-9]{2,6})$/i);
  if (!match) return null;
  return `${match[1].toUpperCase()}-${match[2]}`;
}

function videoExtension(filename) {
  const text = String(filename || "").trim().replace(/[?？\s]+$/u, "");
  if (!text || text.startsWith(".") || !text.includes(".")) return "";
  const match = text.match(/\.([a-z0-9]+)$/i);
  return match ? match[1].toLowerCase() : "";
}

function normalizeCode(text) {
  return extractCode(String(text || "").trim());
}

function cleanFile(file) {
  const filename = safeText(file.filename, 260);
  const relativePath = safeText(file.relative_path, 1200);
  if (!filename || !relativePath || !isVideoFile(filename)) return null;

  const size = Number(file.size_bytes);
  const mtime = file.mtime ? new Date(file.mtime) : null;
  return {
    filename,
    relative_path: relativePath,
    size_bytes: Number.isFinite(size) && size >= 0 ? Math.round(size) : 0,
    mtime: mtime && !Number.isNaN(mtime.getTime()) ? mtime.toISOString() : null,
    code: normalizeCode(filename),
  };
}

async function ensureDevice(name) {
  const existing = await supabaseRequest(`/devices?name=eq.${encodeURIComponent(name)}&select=*`);
  if (existing.length) return existing[0];
  const created = await supabaseRequest("/devices?select=*", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({ name }),
  });
  return created[0];
}

async function ensureSource(deviceId, name, pathLabel) {
  const existing = await supabaseRequest(
    `/sources?device_id=eq.${encodeURIComponent(deviceId)}&name=eq.${encodeURIComponent(name)}&select=*`
  );
  if (existing.length) {
    const updated = await supabaseRequest(`/sources?id=eq.${encodeURIComponent(existing[0].id)}&select=*`, {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({ path_label: pathLabel }),
    });
    return updated[0];
  }
  const created = await supabaseRequest("/sources?select=*", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({ device_id: deviceId, name, path_label: pathLabel }),
  });
  return created[0];
}

module.exports = {
  CHUNK_SIZE,
  MAX_FILES_PER_SYNC,
  cleanFile,
  ensureDevice,
  ensureSource,
  methodNotAllowed,
  normalizeCode,
  safeText,
  sendJson,
  supabaseRequest,
};

const {
  CHUNK_SIZE,
  MAX_FILES_PER_SYNC,
  assertSyncToken,
  cleanFile,
  ensureDevice,
  ensureSource,
  methodNotAllowed,
  safeText,
  sendJson,
  supabaseRequest,
} = require("./lib/supabase");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") return methodNotAllowed(res);

  try {
    assertSyncToken(req);

    const deviceName = safeText(req.body?.deviceName, 80);
    const sourceName = safeText(req.body?.sourceName, 80);
    const pathLabel = String(req.body?.pathLabel || "").trim().slice(0, 300);
    const inputFiles = Array.isArray(req.body?.files) ? req.body.files : null;
    if (!deviceName || !sourceName || !inputFiles) {
      return sendJson(res, 400, { error: "Invalid sync payload" });
    }
    if (inputFiles.length > MAX_FILES_PER_SYNC) {
      return sendJson(res, 413, { error: `Too many files; max is ${MAX_FILES_PER_SYNC}` });
    }

    const files = dedupeFilesByName(inputFiles.map(cleanFile).filter(Boolean));
    const device = await ensureDevice(deviceName);
    const source = await ensureSource(device.id, sourceName, pathLabel);
    const now = new Date().toISOString();

    await supabaseRequest(
      `/files?device_id=eq.${encodeURIComponent(device.id)}&source_id=eq.${encodeURIComponent(source.id)}`,
      { method: "DELETE" }
    );

    for (let i = 0; i < files.length; i += CHUNK_SIZE) {
      const chunk = files.slice(i, i + CHUNK_SIZE).map((file) => ({
        ...file,
        device_id: device.id,
        source_id: source.id,
        last_seen_at: now,
      }));
      if (chunk.length) {
        await supabaseRequest("/files?on_conflict=device_id,filename", {
          method: "POST",
          headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
          body: JSON.stringify(chunk),
        });
      }
    }

    await supabaseRequest(`/sources?id=eq.${encodeURIComponent(source.id)}`, {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ last_sync_at: now, path_label: pathLabel, file_count: files.length }),
    });
    await supabaseRequest(`/devices?id=eq.${encodeURIComponent(device.id)}`, {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ last_sync_at: now }),
    });

    return sendJson(res, 200, { count: files.length });
  } catch (error) {
    return sendJson(res, error.statusCode || 500, { error: error.message });
  }
};

function dedupeFilesByName(files) {
  const byName = new Map();
  for (const file of files) byName.set(file.filename, file);
  return Array.from(byName.values());
}

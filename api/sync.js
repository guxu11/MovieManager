const {
  CHUNK_SIZE,
  MAX_FILES_PER_SYNC,
  cleanFile,
  ensureDevice,
  ensureSource,
  methodNotAllowed,
  safeText,
  sendJson,
  supabaseRequest,
} = require("./lib/supabase");
const { buildSearchDocument } = require("./lib/search-text");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") return methodNotAllowed(res);

  try {
    const deviceName = safeText(req.body?.deviceName, 80);
    const sourceName = safeText(req.body?.sourceName, 80);
    const pathLabel = String(req.body?.pathLabel || "").trim().slice(0, 300);
    const inputFiles = Array.isArray(req.body?.files) ? req.body.files : null;
    const resetSource = req.body?.resetSource !== false;
    const isFinalBatch = req.body?.isFinalBatch !== false;
    const processedCount = Number(req.body?.processedCount);
    if (!deviceName || !sourceName || !inputFiles) {
      return sendJson(res, 400, { error: "Invalid sync payload" });
    }
    if (inputFiles.length > MAX_FILES_PER_SYNC) {
      return sendJson(res, 413, { error: `Too many files; max is ${MAX_FILES_PER_SYNC}` });
    }

    const files = dedupeFilesByName(inputFiles.map(cleanFile).filter(Boolean));
    const skippedCount = inputFiles.length - files.length;
    const device = await ensureDevice(deviceName);
    const source = await ensureSource(device.id, sourceName, pathLabel);
    const now = new Date().toISOString();
    const favoriteNames = resetSource
      ? await existingFavoriteNames(device.id, source.id)
      : new Set();

    if (resetSource) {
      await supabaseRequest(
        `/files?device_id=eq.${encodeURIComponent(device.id)}&source_id=eq.${encodeURIComponent(source.id)}`,
        { method: "DELETE" }
      );
    }

    for (let i = 0; i < files.length; i += CHUNK_SIZE) {
      const chunk = files.slice(i, i + CHUNK_SIZE).map((file) => ({
        ...file,
        ...buildSearchDocument({
          ...file,
          sourceName,
          pathLabel,
          deviceName,
        }),
        device_id: device.id,
        source_id: source.id,
        is_favorite: favoriteNames.has(file.filename),
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

    const sourcePatch = {
      path_label: pathLabel,
      file_count: Number.isFinite(processedCount) && processedCount >= files.length
        ? Math.round(processedCount)
        : files.length,
    };
    if (isFinalBatch) sourcePatch.last_sync_at = now;

    await supabaseRequest(`/sources?id=eq.${encodeURIComponent(source.id)}`, {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify(sourcePatch),
    });
    if (isFinalBatch) {
      await supabaseRequest(`/devices?id=eq.${encodeURIComponent(device.id)}`, {
        method: "PATCH",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({ last_sync_at: now }),
      });
    }

    return sendJson(res, 200, { count: sourcePatch.file_count, batchCount: files.length, skippedCount });
  } catch (error) {
    return sendJson(res, error.statusCode || 500, { error: error.message });
  }
};

function dedupeFilesByName(files) {
  const byName = new Map();
  for (const file of files) byName.set(file.filename, file);
  return Array.from(byName.values());
}

async function existingFavoriteNames(deviceId, sourceId) {
  const rows = await supabaseRequest(
    `/files?device_id=eq.${encodeURIComponent(deviceId)}&source_id=eq.${encodeURIComponent(sourceId)}&is_favorite=eq.true&select=filename`
  );
  return new Set(rows.map((row) => row.filename));
}

const {
  methodNotAllowed,
  sendJson,
  supabaseRequest,
} = require("./lib/supabase");
const { buildSearchDocument } = require("./lib/search-text");

const SELECT = "id,device_id,source_id,filename,relative_path,size_bytes,mtime,code,is_favorite,last_seen_at,sources(name,path_label,devices(name))";
const READ_CHUNK_SIZE = 1000;
const WRITE_CHUNK_SIZE = 500;
const MAX_CHUNKS = 20;

module.exports = async function handler(req, res) {
  if (req.method !== "POST") return methodNotAllowed(res);

  try {
    const rows = await fetchRows();
    const updates = rows.map((row) => ({
      id: row.id,
      device_id: row.device_id,
      source_id: row.source_id,
      filename: row.filename,
      relative_path: row.relative_path,
      size_bytes: row.size_bytes,
      mtime: row.mtime,
      code: row.code,
      is_favorite: row.is_favorite,
      last_seen_at: row.last_seen_at,
      ...buildSearchDocument({
        filename: row.filename,
        relativePath: row.relative_path,
        code: row.code,
        sourceName: row.sources?.name,
        pathLabel: row.sources?.path_label,
        deviceName: row.sources?.devices?.name,
      }),
    }));

    for (let i = 0; i < updates.length; i += WRITE_CHUNK_SIZE) {
      await supabaseRequest("/files?on_conflict=id", {
        method: "POST",
        headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
        body: JSON.stringify(updates.slice(i, i + WRITE_CHUNK_SIZE)),
      });
    }

    return sendJson(res, 200, { count: updates.length });
  } catch (error) {
    return sendJson(res, error.statusCode || 500, { error: error.message });
  }
};

async function fetchRows() {
  const rows = [];
  for (let i = 0; i < MAX_CHUNKS; i++) {
    const offset = i * READ_CHUNK_SIZE;
    const chunk = await supabaseRequest(
      `/files?select=${SELECT}&order=last_seen_at.desc&limit=${READ_CHUNK_SIZE}&offset=${offset}`
    );
    rows.push(...chunk);
    if (chunk.length < READ_CHUNK_SIZE) break;
  }
  return rows;
}

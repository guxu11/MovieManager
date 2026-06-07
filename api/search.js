const {
  methodNotAllowed,
  normalizeCode,
  safeText,
  sendJson,
  supabaseRequest,
} = require("./lib/supabase");
const { translateSearchQuery } = require("./lib/deepl");
const {
  candidateSearchTerms,
  hasDictionaryCoverage,
  matchesSearchTokens,
  tokenizeSearchQueries,
} = require("./lib/search-text");

const PAGE_SIZE = 10;
const CANDIDATE_CHUNK_SIZE = 1000;
const MAX_CANDIDATE_CHUNKS = 20;
const SELECT = "*,sources(name,path_label,last_sync_at,devices(name))";

module.exports = async function handler(req, res) {
  if (req.method !== "GET") return methodNotAllowed(res);

  try {
    const query = safeText(req.query.q, 120);
    if (!query) return sendJson(res, 400, { error: "Missing query" });
    const offset = safeOffset(req.query.offset);
    const baseTokens = tokenizeSearchQueries([query]);
    const translations = hasDictionaryCoverage(baseTokens) ? [] : await translateSearchQuery(query);
    const tokens = translations.length ? tokenizeSearchQueries([query, ...translations]) : baseTokens;

    const code = normalizeCode(query);
    if (code && isExactCodeQuery(tokens, code)) {
      const exact = await fetchAll(
        `/files?code=eq.${encodeURIComponent(code)}&select=${SELECT}&order=last_seen_at.desc`
      );
      if (exact.length) return sendJson(res, 200, pageResult(exact, offset));
      if (offset > 0) return sendJson(res, 200, pageResult([], offset));
    }

    const token = tokens.parts[0] || tokens.compact || query;
    return sendJson(res, 200, await searchFilenamePage(token, tokens, offset));
  } catch (error) {
    return sendJson(res, error.statusCode || 500, { error: error.message });
  }
};

async function searchFilenamePage(token, tokens, offset) {
  const terms = candidateSearchTerms(tokens);
  const path = tokens.parts.length > 1
    ? `/files?select=${SELECT}&order=last_seen_at.desc`
    : `/files?or=(${searchOrTerms(terms.length ? terms : [token])})&select=${SELECT}&order=last_seen_at.desc`;
  const candidates = await fetchAll(path);
  return pageResult(filterByTokens(candidates, tokens), offset);
}

function searchOrTerms(terms) {
  return terms.flatMap((term) => {
    const encoded = encodeURIComponent(term);
    return [
      `filename.ilike.*${encoded}*`,
      `relative_path.ilike.*${encoded}*`,
      `search_text.ilike.*${encoded}*`,
      `search_aliases.ilike.*${encoded}*`,
    ];
  }).join(",");
}

async function fetchAll(basePath) {
  const rows = [];
  for (let i = 0; i < MAX_CANDIDATE_CHUNKS; i++) {
    const offset = i * CANDIDATE_CHUNK_SIZE;
    const chunk = await supabaseRequest(`${basePath}&limit=${CANDIDATE_CHUNK_SIZE}&offset=${offset}`);
    rows.push(...chunk);
    if (chunk.length < CANDIDATE_CHUNK_SIZE) break;
  }
  return rows;
}

function pageResult(rows, offset) {
  const total = rows.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(Math.floor(offset / PAGE_SIZE), totalPages - 1);
  const pageOffset = page * PAGE_SIZE;
  return {
    rows: rows.slice(pageOffset, pageOffset + PAGE_SIZE),
    pageSize: PAGE_SIZE,
    page,
    total,
    totalPages,
    nextOffset: pageOffset + PAGE_SIZE,
    hasMore: page + 1 < totalPages,
  };
}

function safeOffset(value) {
  const offset = Number(value);
  return Number.isFinite(offset) && offset > 0 ? Math.floor(offset) : 0;
}

function filterByTokens(rows, tokens) {
  if (!tokens.compact && !tokens.parts.length) return rows;
  return rows.filter((row) => matchesSearchTokens(row, tokens));
}

function isExactCodeQuery(tokens, code) {
  const compactCode = String(code || "").toLowerCase().replace(/[^a-z0-9]+/g, "");
  return tokens.compact === compactCode;
}

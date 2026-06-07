const CACHE_LIMIT = 500;
const cache = new Map();

async function translateSearchQuery(query) {
  const key = process.env.DEEPL_API_KEY;
  if (!key) return [];

  const text = String(query || "").trim();
  if (!text || text.length > 120 || looksLikeCode(text)) return [];

  const targets = targetLanguagesFor(text);
  const translations = [];
  for (const target of targets) {
    const translated = await translateText(text, target, key);
    if (translated) translations.push(translated);
  }
  return uniqueValues(translations);
}

async function translateText(text, targetLang, key) {
  const cacheKey = `${targetLang}:${text}`;
  if (cache.has(cacheKey)) return cache.get(cacheKey);

  const endpoint = deepLEndpoint(key);
  const response = await fetch(`${endpoint}/v2/translate`, {
    method: "POST",
    headers: {
      Authorization: `DeepL-Auth-Key ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      text: [text],
      target_lang: targetLang,
      split_sentences: "0",
      preserve_formatting: true,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    console.warn(`DeepL ${targetLang} failed: ${response.status} ${body}`);
    return "";
  }

  const json = await response.json();
  const translated = String(json.translations?.[0]?.text || "").trim();
  remember(cacheKey, translated);
  return translated;
}

function deepLEndpoint(key) {
  if (process.env.DEEPL_API_URL) return process.env.DEEPL_API_URL.replace(/\/$/, "");
  return key.endsWith(":fx") ? "https://api-free.deepl.com" : "https://api.deepl.com";
}

function targetLanguagesFor(text) {
  const value = String(text || "");
  if (/[a-z]/i.test(value)) return ["ZH", "JA"];
  if (/[\u3040-\u30ff]/.test(value)) return ["EN", "ZH"];
  if (/[\u3400-\u9fff]/.test(value)) return ["EN", "JA"];
  return ["EN", "ZH", "JA"];
}

function looksLikeCode(text) {
  return /^[a-z]{2,8}[\s._-]*\d{2,6}$/i.test(text.trim());
}

function uniqueValues(values) {
  return Array.from(new Set(values.map((value) => String(value || "").trim()).filter(Boolean)));
}

function remember(key, value) {
  cache.set(key, value);
  if (cache.size <= CACHE_LIMIT) return;
  const firstKey = cache.keys().next().value;
  cache.delete(firstKey);
}

module.exports = {
  translateSearchQuery,
};

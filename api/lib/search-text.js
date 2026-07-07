const SEARCH_GROUPS = [
  ["nurse", "nurses", "护士", "護理", "看護", "看護師"],
  ["teacher", "teachers", "教授", "老师", "教師", "先生"],
  ["student", "students", "学生", "學生", "生徒"],
  ["doctor", "doctors", "医生", "醫生", "医師"],
  ["patient", "patients", "病人", "患者"],
  ["hospital", "clinic", "医院", "醫院", "病院", "クリニック"],
  ["office", "officer", "worker", "上班", "办公室", "辦公室", "会社", "職場"],
  ["wife", "wives", "married", "太太", "妻子", "人妻", "既婚"],
  ["husband", "丈夫", "老公", "夫"],
  ["mother", "mom", "妈妈", "媽媽", "母親", "母"],
  ["father", "dad", "爸爸", "父親", "父"],
  ["sister", "姐妹", "姐姐", "妹妹", "姉", "妹"],
  ["brother", "兄弟", "哥哥", "弟弟", "兄", "弟"],
  ["friend", "friends", "朋友", "好友", "友達"],
  ["girlfriend", "女友", "彼女"],
  ["boyfriend", "男友", "彼氏"],
  ["neighbor", "neighbour", "邻居", "鄰居", "隣人"],
  ["school", "campus", "学校", "學校", "校园", "校園", "学園"],
  ["classroom", "教室", "课堂", "課堂"],
  ["hotel", "旅馆", "旅館", "酒店", "ホテル"],
  ["home", "house", "family", "家", "家庭", "自宅"],
  ["apartment", "room", "公寓", "房间", "房間", "部屋"],
  ["train", "subway", "地铁", "地鐵", "電車", "列車"],
  ["bus", "公交", "公车", "公車", "バス"],
  ["car", "taxi", "汽车", "汽車", "車", "タクシー"],
  ["outdoor", "outside", "户外", "戶外", "野外"],
  ["indoor", "inside", "室内", "室內", "屋内"],
  ["morning", "早上", "早晨", "朝"],
  ["night", "evening", "晚上", "夜", "夜晚"],
  ["story", "true", "真实", "真實", "実話"],
  ["uncensored", "无码", "無碼", "流出"],
  ["subtitle", "subtitles", "字幕", "中字"],
  ["hd", "高清", "高画質"],
  ["collection", "合集", "精选", "精選", "まとめ"],
  ["uniform", "制服", "ユニフォーム"],
  ["cosplay", "roleplay", "角色扮演", "コスプレ"],
  ["maid", "女仆", "女僕", "メイド"],
  ["secretary", "秘书", "秘書"],
  ["boss", "老板", "老闆", "上司"],
  ["manager", "经理", "經理", "管理者"],
  ["actress", "演员", "演員", "女優"],
  ["idol", "偶像", "アイドル"],
  ["model", "模特", "モデル"],
  ["lesbian", "lesbians", "女同", "百合", "レズ"],
  ["kiss", "kissing", "接吻", "亲吻", "親吻", "キス"],
  ["date", "dating", "约会", "約會", "デート"],
  ["travel", "trip", "旅行", "旅"],
  ["beach", "海边", "海邊", "海", "ビーチ"],
  ["bath", "bathroom", "shower", "浴室", "洗澡", "シャワー"],
  ["massage", "按摩", "マッサージ"],
  ["interview", "面试", "面試", "采访", "採訪", "インタビュー"],
  ["amateur", "素人", "业余", "業餘"],
  ["new", "新人", "新作"],
  ["mature", "熟女", "成熟女性"],
  ["young", "年轻", "年輕", "若い"],
  ["premium", "精品", "精选", "精選"],
  ["leak", "leaked", "流出", "泄露", "外流"],
  ["training", "lesson", "训练", "訓練", "课程", "課程", "レッスン"],
  ["game", "游戏", "遊戲", "ゲーム"],
  ["party", "派对", "派對", "パーティー"],
  ["wedding", "婚礼", "婚禮", "結婚式"],
  ["gym", "fitness", "健身", "ジム"],
  ["sport", "sports", "运动", "運動", "スポーツ"],
  ["swimsuit", "泳装", "泳裝", "水着"],
  ["stocking", "stockings", "丝袜", "絲襪", "ストッキング"],
  ["glasses", "眼镜", "眼鏡", "メガネ"],
  ["beautiful", "beauty", "美女", "漂亮", "美人"],
  ["cute", "可爱", "可愛", "かわいい"],
  ["solo", "单人", "單人", "ソロ"],
  ["group", "多人", "群体", "群體", "グループ"],
  ["couple", "couples", "情侣", "情侶", "カップル"],
  ["revenge", "复仇", "復仇", "リベンジ"],
  ["secret", "秘密", "シークレット"],
  ["private", "私人", "私密", "プライベート"],
  ["first", "第一次", "初次", "初めて"],
];

const ALIAS_LOOKUP = buildAliasLookup(SEARCH_GROUPS);

function buildSearchDocument({ filename, relativePath, code, sourceName, pathLabel, deviceName } = {}) {
  const base = [
    filename,
    stripExtension(filename),
    relativePath,
    stripExtension(relativePath),
    code,
    sourceName,
    pathLabel,
    deviceName,
  ].filter(Boolean);
  const normalized = base.map(normalizeSearchText);
  const aliases = expandAliases([...base, ...normalized]);
  return {
    search_text: uniqueWords([...base, ...normalized]).join(" ").slice(0, 4000),
    search_aliases: aliases.join(" ").slice(0, 4000),
  };
}

function tokenizeSearchQuery(query) {
  return tokenizeSearchQueries([query]);
}

function tokenizeSearchQueries(queries) {
  const alternatives = queries
    .map((query) => splitTokens(query).slice(0, 8))
    .filter((parts) => parts.length);
  const parts = alternatives[0] || [];
  const allParts = alternatives.flat();
  const expanded = expandAliases(parts);
  const expandedAll = expandAliases(allParts);
  return {
    compact: parts.join(""),
    parts: parts.slice(0, 8),
    alternatives,
    expandedParts: uniqueWords([...allParts, ...expanded, ...expandedAll]).slice(0, 80),
  };
}

function candidateSearchTerms(tokens) {
  return uniqueWords([...(tokens.parts || []), ...(tokens.expandedParts || [])])
    .filter((term) => term.length >= 2)
    .slice(0, 12);
}

function hasDictionaryCoverage(tokens) {
  const parts = tokens.parts || [];
  return parts.length > 0 && parts.every((part) => aliasTermsForPart(part).length > 1);
}

function matchesSearchTokens(row, tokens) {
  if (!tokens.compact && !tokens.parts.length) return true;
  const document = row.search_text || row.search_aliases
    ? `${row.search_text || ""} ${row.search_aliases || ""}`
    : buildSearchDocument({
      filename: row.filename,
      relativePath: row.relative_path,
      code: row.code,
      sourceName: row.sources?.name || row.source_name,
      pathLabel: row.sources?.path_label,
      deviceName: row.sources?.devices?.name || row.device_name,
    }).search_text;
  const text = normalizeSearchText(document);
  const compactText = text.replace(/[^a-z0-9\u3040-\u30ff\u3400-\u9fff]+/g, "");
  if (tokens.compact && compactText.includes(tokens.compact)) return true;
  return (tokens.alternatives || [tokens.parts]).some((parts) => matchesAllParts(text, parts));
}

function matchesAllParts(text, parts) {
  return parts.length > 0 && parts.every((part) => {
    const aliases = aliasTermsForPart(part);
    return aliases.some((alias) => text.includes(alias));
  });
}

function normalizeSearchText(value) {
  return String(value || "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[‐‑‒–—―]/g, "-")
    .replace(/[“”]/g, "\"")
    .replace(/[‘’]/g, "'")
    .replace(/[\u30a1-\u30f6]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 0x60))
    .replace(/繁體|繁体/g, "繁体")
    .replace(/\s+/g, " ")
    .trim();
}

function expandAliases(values) {
  const result = [];
  for (const value of values) {
    const normalizedValue = normalizeSearchText(value);
    for (const token of splitTokens(value)) {
      result.push(token);
      const aliases = ALIAS_LOOKUP.get(token);
      if (aliases) result.push(...aliases);
    }
    for (const [keyword, aliases] of ALIAS_LOOKUP.entries()) {
      if (containsCjk(keyword) && normalizedValue.includes(keyword)) result.push(...aliases);
    }
  }
  return uniqueWords(result);
}

function aliasTermsForPart(part) {
  const normalized = normalizeSearchText(part);
  const aliases = ALIAS_LOOKUP.get(normalized);
  if (aliases) return aliases;

  const result = [normalized];
  for (const [keyword, keywordAliases] of ALIAS_LOOKUP.entries()) {
    if (keyword.length < 2) continue;
    if (containsCjk(keyword) && normalized.includes(keyword)) result.push(...keywordAliases);
  }
  return uniqueWords(result);
}

function containsCjk(value) {
  return /[\u3040-\u30ff\u3400-\u9fff]/.test(value);
}

function splitTokens(value) {
  return normalizeSearchText(value)
    .split(/[\s._,，、;；|/\\()[\]{}'"]+/)
    .filter(Boolean);
}

function stripExtension(value) {
  return String(value || "").replace(/\.[^.\\/]+$/, "");
}

function uniqueWords(values) {
  return Array.from(new Set(values.map((value) => normalizeSearchText(value)).filter(Boolean)));
}

function buildAliasLookup(groups) {
  const lookup = new Map();
  for (const group of groups) {
    const normalized = uniqueWords(group);
    for (const item of normalized) lookup.set(item, normalized);
  }
  return lookup;
}

module.exports = {
  buildSearchDocument,
  candidateSearchTerms,
  hasDictionaryCoverage,
  matchesSearchTokens,
  normalizeSearchText,
  tokenizeSearchQueries,
  tokenizeSearchQuery,
};

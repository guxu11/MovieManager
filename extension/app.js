const VIDEO_SUFFIXES = new Set(["mp4", "ts", "mkv", "avi", "mov", "wmv", "flv", "m4v"]);
const SETTINGS_KEY = "movie-manager:settings";
const DEMO_KEY = "movie-manager:demo-db";
const LOCAL_DEVICE_ID_KEY = "movie-manager:local-device-id";
const HANDLE_DB_NAME = "movie-manager-handles";
const HANDLE_STORE_NAME = "source-handles";
const REMOTE_SYNC_CHUNK_SIZE = 500;
const SEARCH_CACHE_KEY = "movie-manager:last-search";
const SEARCH_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const DEFAULT_API_BASE_URL = "https://moviemanager-rho.vercel.app";

const els = {
  settingsToggle: document.querySelector("#settingsToggle"),
  settingsPanel: document.querySelector("#settingsPanel"),
  storageMode: document.querySelector("#storageMode"),
  apiBaseUrl: document.querySelector("#apiBaseUrl"),
  saveSettings: document.querySelector("#saveSettings"),
  checkNativeHelper: document.querySelector("#checkNativeHelper"),
  nativeHelperStatus: document.querySelector("#nativeHelperStatus"),
  clearSettings: document.querySelector("#clearSettings"),
  tabs: document.querySelectorAll(".tab"),
  views: {
    search: document.querySelector("#searchTab"),
    favorites: document.querySelector("#favoritesTab"),
    sync: document.querySelector("#syncTab"),
    sources: document.querySelector("#sourcesTab"),
  },
  searchForm: document.querySelector("#searchForm"),
  searchInput: document.querySelector("#searchInput"),
  clearSearch: document.querySelector("#clearSearch"),
  searchMeta: document.querySelector("#searchMeta"),
  results: document.querySelector("#results"),
  searchPagination: document.querySelector("#searchPagination"),
  prevSearchPage: document.querySelector("#prevSearchPage"),
  nextSearchPage: document.querySelector("#nextSearchPage"),
  searchPageStatus: document.querySelector("#searchPageStatus"),
  searchPageButtons: document.querySelector("#searchPageButtons"),
  favoritesList: document.querySelector("#favoritesList"),
  deviceName: document.querySelector("#deviceName"),
  sourceName: document.querySelector("#sourceName"),
  pathLabel: document.querySelector("#pathLabel"),
  pickDirectory: document.querySelector("#pickDirectory"),
  helperScanDirectory: document.querySelector("#helperScanDirectory"),
  directoryInput: document.querySelector("#directoryInput"),
  syncStatus: document.querySelector("#syncStatus"),
  refreshSources: document.querySelector("#refreshSources"),
  refreshFavorites: document.querySelector("#refreshFavorites"),
  sourcesList: document.querySelector("#sourcesList"),
  resultTemplate: document.querySelector("#resultTemplate"),
};

let store = createStore(loadSettings());
let extensionState = { installed: false };
const favoriteStateOverrides = new Map();
let searchPageState = { query: "", page: 0, total: 0, totalPages: 1, hasMore: false };

init();

function init() {
  const settings = loadSettings();
  els.apiBaseUrl.value = settings.apiBaseUrl || "";
  updateStorageMode();
  restoreSyncForm();
  detectExtension();
  restoreSearchState();

  els.settingsToggle.addEventListener("click", () => {
    els.settingsPanel.classList.toggle("hidden");
  });

  els.saveSettings.addEventListener("click", () => {
    saveSettings({
      apiBaseUrl: els.apiBaseUrl.value.trim(),
    });
    store = createStore(loadSettings());
    updateStorageMode();
    toast("Supabase 配置已保存。");
  });

  els.checkNativeHelper.addEventListener("click", checkNativeHelper);

  els.clearSettings.addEventListener("click", () => {
    localStorage.removeItem(SETTINGS_KEY);
    const settings = loadSettings();
    els.apiBaseUrl.value = settings.apiBaseUrl || "";
    store = createStore(settings);
    updateStorageMode();
    toast("已清除本机覆盖配置。");
  });

  els.tabs.forEach((tab) => {
    tab.addEventListener("click", () => showTab(tab.dataset.tab));
  });

  els.searchForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    await runSearch({ reset: true });
  });
  els.clearSearch.addEventListener("click", clearSearch);
  els.prevSearchPage.addEventListener("click", () => changeSearchPage(-1));
  els.nextSearchPage.addEventListener("click", () => changeSearchPage(1));

  els.pickDirectory.addEventListener("click", syncWithDirectoryPicker);
  els.helperScanDirectory.addEventListener("click", syncWithNativeHelper);
  els.directoryInput.addEventListener("change", async () => {
    if (!els.directoryInput.files.length) return;
    const files = Array.from(els.directoryInput.files);
    applySelectedDirectoryName(getRootDirectoryName(files));
    await syncFiles(files, "webkit");
    els.directoryInput.value = "";
  });
  els.refreshSources.addEventListener("click", renderSources);
  els.refreshFavorites?.addEventListener("click", () => {
    if (typeof renderFavorites === "function") {
      renderFavorites();
    }
  });
}

function loadSettings() {
  const defaults = loadBundledConfig();
  try {
    const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}");
    if (!String(saved.apiBaseUrl || "").trim()) delete saved.apiBaseUrl;
    return {
      ...defaults,
      ...saved,
    };
  } catch {
    return defaults;
  }
}

function saveSettings(settings) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

function loadBundledConfig() {
  const config = window.MOVIE_MANAGER_CONFIG || {};
  return {
    apiBaseUrl: String(config.apiBaseUrl || DEFAULT_API_BASE_URL).trim(),
  };
}

function updateStorageMode() {
  const settings = loadSettings();
  els.storageMode.textContent = shouldUseApi(settings) ? "云端 API" : "本地 demo";
}

function restoreSyncForm() {
  els.deviceName.value = localStorage.getItem("movie-manager:last-device") || getSuggestedDeviceName();
  els.sourceName.value = localStorage.getItem("movie-manager:last-source") || "";
  els.pathLabel.value = localStorage.getItem("movie-manager:last-path-label") || "";
}

function rememberSyncForm() {
  localStorage.setItem("movie-manager:last-device", els.deviceName.value.trim());
  localStorage.setItem("movie-manager:last-source", els.sourceName.value.trim());
  localStorage.setItem("movie-manager:last-path-label", els.pathLabel.value.trim());
}

function getSuggestedDeviceName() {
  return `${getPlatformLabel()} ${getLocalDeviceId()}`;
}

function getPlatformLabel() {
  const platform = (navigator.userAgentData?.platform || navigator.platform || "").toLowerCase();
  const userAgent = navigator.userAgent.toLowerCase();
  const value = `${platform} ${userAgent}`;

  if (value.includes("ipad")) return "iPad";
  if (value.includes("iphone")) return "iPhone";
  if (value.includes("mac")) return "Mac";
  if (value.includes("win")) return "Windows";
  if (value.includes("android")) return "Android";
  if (value.includes("linux")) return "Linux";
  return "Device";
}

function getLocalDeviceId() {
  const existing = localStorage.getItem(LOCAL_DEVICE_ID_KEY);
  if (existing) return existing;

  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = new Uint8Array(4);
  crypto.getRandomValues(bytes);
  const id = Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("");
  localStorage.setItem(LOCAL_DEVICE_ID_KEY, id);
  return id;
}

function showTab(name) {
  els.tabs.forEach((tab) => tab.classList.toggle("active", tab.dataset.tab === name));
  Object.entries(els.views).forEach(([key, view]) => view.classList.toggle("hidden", key !== name));
  if (name === "sources") renderSources();
  if (name === "favorites" && typeof renderFavorites === "function") renderFavorites();
}

function clearSearch() {
  els.searchInput.value = "";
  els.searchMeta.textContent = "支持多个关键词同时匹配。";
  els.results.replaceChildren();
  searchPageState = { query: "", page: 0, total: 0, totalPages: 1, hasMore: false };
  renderPagination();
  localStorage.removeItem(SEARCH_CACHE_KEY);
  els.searchInput.focus();
}

async function runSearch({ reset = false, page = 0 } = {}) {
  const query = els.searchInput.value.trim();
  if (!query) {
    searchPageState = { query: "", page: 0, total: 0, totalPages: 1, hasMore: false };
    renderEmpty("输入关键词或文件名。");
    renderPagination();
    return;
  }

  if (reset || query !== searchPageState.query) {
    searchPageState = { query, page: 0, total: 0, totalPages: 1, hasMore: false };
    page = 0;
  }

  els.searchMeta.textContent = "搜索中...";
  try {
    const result = await store.search(query, page);
    const rows = result.rows || [];
    const total = Number.isFinite(Number(result.total)) ? Number(result.total) : rows.length;
    const totalPages = Math.max(1, Number(result.totalPages) || Math.ceil(total / (result.pageSize || 10)) || 1);
    const currentPage = Math.min(Number(result.page) || page, totalPages - 1);
    searchPageState = {
      query,
      page: currentPage,
      total,
      totalPages,
      hasMore: currentPage + 1 < totalPages,
    };
    const code = normalizeCode(query);
    els.searchMeta.textContent = code
      ? `已按关键词搜索，共 ${total} 个位置。`
      : `已按文件名搜索，共 ${total} 个候选。`;
    renderResults(rows);
    renderPagination();
    saveSearchState({
      query,
      rows,
      meta: els.searchMeta.textContent,
      pageState: searchPageState,
      emptyText: rows.length ? "" : "没有找到。可以去同步页更新这台设备的目录索引。",
    });
  } catch (error) {
    els.searchMeta.textContent = "搜索失败。";
    renderEmpty(error.message);
    renderPagination();
    saveSearchState({ query, rows: [], meta: els.searchMeta.textContent, pageState: searchPageState, emptyText: error.message });
  }
}

async function changeSearchPage(direction) {
  const nextPage = searchPageState.page + direction;
  if (nextPage < 0) return;
  if (direction > 0 && !searchPageState.hasMore) return;
  await runSearch({ page: nextPage });
}

async function goToSearchPage(page) {
  if (page === searchPageState.page) return;
  if (page < 0 || page >= searchPageState.totalPages) return;
  await runSearch({ page });
}

function renderPagination() {
  if (!els.searchPagination) return;
  const hasPrevious = searchPageState.page > 0;
  const hasNext = searchPageState.page + 1 < searchPageState.totalPages;
  els.searchPagination.classList.toggle("hidden", searchPageState.total === 0);
  els.prevSearchPage.disabled = !hasPrevious;
  els.nextSearchPage.disabled = !hasNext;
  els.searchPageStatus.textContent = `共 ${searchPageState.total} 条 / ${searchPageState.totalPages} 页`;
  renderPageButtons();
}

function renderPageButtons() {
  if (!els.searchPageButtons) return;
  els.searchPageButtons.replaceChildren();
  const totalPages = searchPageState.totalPages;
  const current = searchPageState.page;
  if (totalPages <= 1) return;

  for (const item of visiblePageItems(current, totalPages)) {
    if (item === "...") {
      const ellipsis = document.createElement("span");
      ellipsis.className = "page-ellipsis";
      ellipsis.textContent = "...";
      els.searchPageButtons.append(ellipsis);
      continue;
    }
    const button = document.createElement("button");
    button.className = "page-button";
    button.type = "button";
    button.textContent = String(item + 1);
    button.classList.toggle("active", item === current);
    button.disabled = item === current;
    button.addEventListener("click", () => goToSearchPage(item));
    els.searchPageButtons.append(button);
  }
}

function visiblePageItems(current, totalPages) {
  if (totalPages <= 7) return Array.from({ length: totalPages }, (_, index) => index);
  const items = [0];
  const start = Math.max(1, Math.min(current - 1, totalPages - 4));
  const end = Math.min(totalPages - 2, Math.max(current + 1, 3));
  if (start > 1) items.push("...");
  for (let page = start; page <= end; page++) items.push(page);
  if (end < totalPages - 2) items.push("...");
  items.push(totalPages - 1);
  return items;
}

function renderResults(rows) {
  els.results.replaceChildren();
  if (!rows.length) {
    renderEmpty("没有找到。可以去同步页更新这台设备的目录索引。");
    return;
  }

  for (const row of rows) {
    els.results.append(renderResultCard(row, els.results));
  }
}

function renderResultCard(row, ownerList) {
  const node = els.resultTemplate.content.firstElementChild.cloneNode(true);
  const isFavorite = favoriteState(row);
  node.dataset.fileId = row.id || "";
  node.classList.toggle("is-favorite", isFavorite);
  const title = node.querySelector("h3");
  const subtitle = node.querySelector(".muted");
  const path = node.querySelector(".result-path");
  const footer = node.querySelector(".result-footer");
  const actions = node.querySelector(".result-actions");
  const source = row.sources || {};
  const device = source.devices || {};
  const displayPath = joinDisplayPath(source.path_label, row.relative_path);
  const canOpenLocal = extensionState.installed && displayPath && displayPath !== row.relative_path;

  title.textContent = row.code || extractCode(row.filename) || "未匹配编号";
  subtitle.textContent = `${device.name || row.device_name || "未知设备"} / ${source.name || row.source_name || "未知目录"}`;
  path.textContent = displayPath || row.relative_path || row.filename;
  footer.innerHTML = "";
  actions.innerHTML = "";
  footer.append(metaItem(formatBytes(row.size_bytes)));
  footer.append(metaItem(`修改：${formatDate(row.mtime)}`));
  footer.append(metaItem(`同步：${formatDate(row.last_seen_at || source.last_sync_at)}`));

  const favoriteButton = document.createElement("button");
  favoriteButton.className = isFavorite ? "icon-action favorite-toggle favorite-active" : "icon-action favorite-toggle";
  favoriteButton.type = "button";
  favoriteButton.textContent = isFavorite ? "★" : "☆";
  favoriteButton.title = isFavorite ? "取消精选" : "标为精选";
  favoriteButton.setAttribute("aria-label", favoriteButton.title);
  favoriteButton.dataset.tooltip = favoriteButton.title;
  favoriteButton.addEventListener("click", () => toggleFavorite(row, node, ownerList));
  actions.append(favoriteButton);

  if (canOpenLocal) {
    const openButton = document.createElement("button");
    openButton.className = "icon-action";
    openButton.type = "button";
    openButton.textContent = "▶";
    openButton.title = "本机打开";
    openButton.setAttribute("aria-label", "本机打开");
    openButton.dataset.tooltip = "本机打开";
    openButton.addEventListener("click", () => requestLocalOpen(row, displayPath));
    actions.append(openButton);
  }
  return node;
}

async function toggleFavorite(row, node, ownerList) {
  try {
    const next = !favoriteState(row);
    const updated = await store.setFavorite(row.id, next);
    const nextState = Boolean(updated?.is_favorite ?? next);
    row.is_favorite = nextState;
    favoriteStateOverrides.set(row.id, nextState);
    updateRenderedFavoriteState(row.id, nextState);
    updateCachedFavoriteState(row.id, nextState);
  } catch (error) {
    els.searchMeta.textContent = `精选标记失败：${error.message}`;
  }
}

function favoriteState(row) {
  return favoriteStateOverrides.has(row.id)
    ? favoriteStateOverrides.get(row.id)
    : Boolean(row.is_favorite);
}

function updateRenderedFavoriteState(fileId, isFavorite) {
  if (!fileId) return;
  for (const card of document.querySelectorAll(`[data-file-id="${fileId}"]`)) {
    card.classList.toggle("is-favorite", isFavorite);
    const button = card.querySelector(".favorite-toggle");
    if (!button) continue;
    button.classList.toggle("favorite-active", isFavorite);
    button.textContent = isFavorite ? "★" : "☆";
    const label = isFavorite ? "取消精选" : "标为精选";
    button.title = label;
    button.setAttribute("aria-label", label);
    button.dataset.tooltip = label;
  }
}

function saveSearchState({ query, rows, meta, pageState, emptyText = "" }) {
  const payload = {
    query,
    rows,
    meta,
    pageState,
    emptyText,
    savedAt: Date.now(),
  };
  try {
    localStorage.setItem(SEARCH_CACHE_KEY, JSON.stringify(payload));
  } catch {
    // Ignore storage quota issues; search still works without cache.
  }
}

function restoreSearchState() {
  let cached;
  try {
    cached = JSON.parse(localStorage.getItem(SEARCH_CACHE_KEY) || "null");
  } catch {
    return;
  }
  if (!cached || Date.now() - Number(cached.savedAt || 0) > SEARCH_CACHE_TTL_MS) return;

  els.searchInput.value = cached.query || "";
  els.searchMeta.textContent = cached.meta || "已恢复上一次搜索。";
  if (cached.pageState) searchPageState = normalizeSearchPageState(cached.pageState, cached.rows);
  if (Array.isArray(cached.rows) && cached.rows.length) {
    renderResults(cached.rows);
  } else if (cached.emptyText) {
    renderEmpty(cached.emptyText);
  }
  renderPagination();
}

function normalizeSearchPageState(pageState, rows = []) {
  const total = Number(pageState.total);
  const totalPages = Number(pageState.totalPages);
  return {
    query: pageState.query || "",
    page: Math.max(0, Number(pageState.page) || 0),
    total: Number.isFinite(total) ? total : rows.length,
    totalPages: Number.isFinite(totalPages) && totalPages > 0 ? totalPages : 1,
    hasMore: Boolean(pageState.hasMore),
  };
}

function updateCachedFavoriteState(fileId, isFavorite) {
  let cached;
  try {
    cached = JSON.parse(localStorage.getItem(SEARCH_CACHE_KEY) || "null");
  } catch {
    return;
  }
  if (!cached || !Array.isArray(cached.rows)) return;
  let changed = false;
  for (const row of cached.rows) {
    if (row.id === fileId) {
      row.is_favorite = isFavorite;
      changed = true;
    }
  }
  if (changed) localStorage.setItem(SEARCH_CACHE_KEY, JSON.stringify(cached));
}

async function renderFavorites() {
  els.favoritesList.replaceChildren();
  try {
    const rows = await store.listFavorites();
    if (!rows.length) {
      renderFavoritesEmpty();
      return;
    }
    for (const row of rows) {
      els.favoritesList.append(renderResultCard(row, els.favoritesList));
    }
  } catch (error) {
    renderFavoritesEmpty(`加载失败：${error.message}`);
  }
}

function renderFavoritesEmpty(text = "还没有精选。") {
  els.favoritesList.replaceChildren();
  const empty = document.createElement("div");
  empty.className = "empty-state";
  empty.textContent = text;
  els.favoritesList.append(empty);
}

function isCurrentDevice(deviceName) {
  return Boolean(deviceName) && deviceName === els.deviceName.value.trim();
}

async function detectExtension() {
  if (isExtensionPage()) {
    extensionState = { installed: true, version: chrome.runtime.getManifest().version };
    return;
  }
  const response = await sendExtensionMessage({ type: "MOVIE_MANAGER_PING" });
  extensionState = { installed: Boolean(response?.ok), version: response?.version };
}

async function requestLocalOpen(row, displayPath) {
  if (!displayPath || displayPath === row.relative_path) {
    els.searchMeta.textContent = "本机打开需要绝对路径：请在同步页高级选项填写真实路径备注后重新同步。";
    return;
  }

  const response = await sendExtensionMessage({
    type: "MOVIE_MANAGER_OPEN_LOCAL",
    file: {
      filename: row.filename,
      relativePath: row.relative_path,
      displayPath,
      sourceName: row.sources?.name || row.source_name,
      deviceName: row.sources?.devices?.name || row.device_name,
    },
  });
  if (response?.ok) {
    els.searchMeta.textContent = response.message || "已发送本机打开请求。";
    return;
  }
  els.searchMeta.textContent = response?.error || "没有检测到本机打开扩展。";
}

async function checkNativeHelper() {
  els.nativeHelperStatus.textContent = "检测中...";
  const response = await sendExtensionMessage({ type: "MOVIE_MANAGER_NATIVE_STATUS" });
  if (response?.ok) {
    els.nativeHelperStatus.textContent = response.message || "Native helper 正常。";
    return;
  }
  els.nativeHelperStatus.textContent = response?.error || "Native helper 检测失败。";
}

function sendExtensionMessage(message) {
  if (isExtensionPage()) {
    return chrome.runtime.sendMessage(message).catch((error) => ({ ok: false, error: error.message }));
  }

  return new Promise((resolve) => {
    const requestId = crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random());
    const timeout = window.setTimeout(() => {
      window.removeEventListener("message", onMessage);
      resolve(null);
    }, 600);

    function onMessage(event) {
      if (event.source !== window) return;
      if (event.data?.source !== "movie-manager-extension") return;
      if (event.data?.requestId !== requestId) return;
      window.clearTimeout(timeout);
      window.removeEventListener("message", onMessage);
      resolve(event.data.payload);
    }

    window.addEventListener("message", onMessage);
    window.postMessage({ source: "movie-manager-web", requestId, payload: message }, window.location.origin);
  });
}

function isExtensionPage() {
  return location.protocol === "chrome-extension:" && typeof chrome !== "undefined" && Boolean(chrome.runtime?.id);
}

function renderEmpty(text) {
  els.results.replaceChildren();
  const empty = document.createElement("div");
  empty.className = "panel muted";
  empty.textContent = text;
  els.results.append(empty);
}

function metaItem(text) {
  const span = document.createElement("span");
  span.textContent = text || "-";
  return span;
}

async function syncWithDirectoryPicker() {
  if (looksLikeAbsolutePath(els.pathLabel.value.trim()) && extensionState.installed) {
    await syncWithNativeHelper();
    return;
  }

  if (!window.showDirectoryPicker) {
    toast("当前浏览器不支持目录选择器，请使用兼容模式。");
    return;
  }

  try {
    const dirHandle = await window.showDirectoryPicker({ mode: "read" });
    applySelectedDirectoryName(dirHandle.name);
    const files = [];
    const scanStats = createScanStats();
    await walkDirectoryHandle(dirHandle, "", files, scanStats);
    await syncFiles(files, "picker", { dirHandle, scanStats });
  } catch (error) {
    if (error.name === "AbortError") return;
    setSyncStatus(describeDirectoryPickerError(error));
  }
}

async function syncWithNativeHelper() {
  const pathLabel = els.pathLabel.value.trim();
  if (!pathLabel) {
    setSyncStatus("请先在高级选项的路径备注里填写绝对路径。");
    return;
  }
  if (!extensionState.installed) {
    setSyncStatus("没有检测到扩展后台，无法调用本机 Helper。");
    return;
  }

  setSyncStatus("正在通过本机 Helper 扫描路径...");
  const response = await sendExtensionMessage({
    type: "MOVIE_MANAGER_SCAN_DIRECTORY",
    path: pathLabel,
  });
  if (!response?.ok) {
    setSyncStatus(response?.error || "本机 Helper 扫描失败。");
    return;
  }

  if (!els.sourceName.value.trim()) {
    const parts = pathLabel.split(/[\\/]+/).filter(Boolean);
    els.sourceName.value = parts[parts.length - 1] || "Selected Directory";
  }
  await syncNativeScanResponse(response, {});
}

async function syncNativeScanResponse(response, options) {
  return syncFiles(response.files || [], "native", {
    ...options,
    scanStats: scanStatsFromNativeResponse(response),
  });
}

function scanStatsFromNativeResponse(response) {
  return {
    seen: response.seen || 0,
    skippedCount: response.skippedCount || 0,
    skippedSamples: response.skippedSamples || [],
    readErrorCount: response.readErrorCount || 0,
    readErrorSamples: response.readErrorSamples || [],
  };
}

function looksLikeAbsolutePath(path) {
  return Boolean(path && (/^\//.test(path) || /^[a-z]:[\\/]/i.test(path)));
}

async function walkDirectoryHandle(dirHandle, prefix, files, stats = createScanStats()) {
  for await (const [name, handle] of dirHandle.entries()) {
    if (name.startsWith(".")) continue;
    const relativePath = prefix ? `${prefix}/${name}` : name;
    if (handle.kind === "directory") {
      await walkDirectoryHandle(handle, relativePath, files, stats);
      continue;
    }
    stats.seen += 1;
    let file;
    try {
      file = await handle.getFile();
    } catch (error) {
      stats.readErrorCount += 1;
      rememberSample(stats.readErrorSamples, `${relativePath}: ${error.message || "读取失败"}`);
      continue;
    }
    if (!isVideoFile(file.name || name)) {
      stats.skippedCount += 1;
      rememberSample(stats.skippedSamples, relativePath);
      continue;
    }
    files.push({ file, relativePath });
    if (files.length % 500 === 0) setSyncStatus(`已扫描 ${files.length} 个视频文件...`);
  }
}

async function syncFiles(inputFiles, mode, options = {}) {
  const deviceName = options.deviceName || els.deviceName.value.trim();
  const sourceName = options.sourceName || els.sourceName.value.trim() || "Selected Directory";
  const pathLabel = options.pathLabel ?? els.pathLabel.value.trim();

  if (!deviceName) {
    setSyncStatus("请先确认设备名。");
    return null;
  }

  if (!options.skipRemember) rememberSyncForm();
  const normalized = inputFiles.map((entry) => normalizeFileEntry(entry, mode)).filter(Boolean);
  const skipped = normalized.filter((entry) => !isVideoFile(entry.filename));
  const rows = dedupeFilesByName(normalized.filter((entry) => isVideoFile(entry.filename)));

  const scanText = syncScanText(options.scanStats, skipped);
  setSyncStatus(`准备同步 ${rows.length} 个视频文件${scanText}...`);

  try {
    const result = await store.replaceSourceSnapshot({ deviceName, sourceName, pathLabel, files: rows });
    if (options.dirHandle) await saveSourceHandle(deviceName, sourceName, options.dirHandle);
    const skippedText = result.skippedCount ? `，跳过 ${result.skippedCount} 个文件` : "";
    setSyncStatus(`同步完成：${result.count} 个文件已更新到 ${deviceName} / ${sourceName}${skippedText}。`);
    return result;
  } catch (error) {
    setSyncStatus(`同步失败：${error.message}`);
    return null;
  }
}

function createScanStats() {
  return { seen: 0, skippedCount: 0, skippedSamples: [], readErrorCount: 0, readErrorSamples: [] };
}

function rememberSample(samples, value) {
  if (samples.length < 5) samples.push(value);
}

function syncScanText(scanStats, skipped) {
  const skippedCount = scanStats ? scanStats.skippedCount : skipped.length;
  const readErrorCount = scanStats ? scanStats.readErrorCount : 0;
  if (!skippedCount && !readErrorCount) return "";
  const samples = [
    ...(scanStats?.skippedSamples || skipped.map((entry) => entry.relative_path)).slice(0, 2),
    ...(scanStats?.readErrorSamples || []).slice(0, 2),
  ];
  const sampleText = samples.length ? `，示例：${samples.join(" / ")}` : "";
  return `，扫描文件 ${scanStats?.seen ?? skipped.length} 个，跳过 ${skippedCount} 个，读取失败 ${readErrorCount} 个${sampleText}`;
}

function applySelectedDirectoryName(directoryName) {
  const cleanName = String(directoryName || "").trim();
  if (!cleanName) return;
  if (!els.sourceName.value.trim()) els.sourceName.value = cleanName;
}

function getRootDirectoryName(files) {
  const firstPath = files[0]?.webkitRelativePath || "";
  return firstPath.split("/").filter(Boolean)[0] || "";
}

function normalizeFileEntry(entry, mode) {
  if (mode === "native") return entry;
  const file = mode === "picker" ? entry.file : entry;
  const relativePath = mode === "picker"
    ? entry.relativePath
    : file.webkitRelativePath || file.name;
  const filename = file.name || relativePath.split("/").pop();
  return {
    filename,
    relative_path: relativePath,
    size_bytes: file.size || 0,
    mtime: file.lastModified ? new Date(file.lastModified).toISOString() : null,
    code: extractCode(filename),
  };
}

function dedupeFilesByName(files) {
  const byName = new Map();
  for (const file of files) byName.set(file.filename, file);
  return Array.from(byName.values());
}

async function renderSources() {
  els.sourcesList.replaceChildren();
  try {
    const sources = await store.listSources();
    if (!sources.length) {
      const empty = document.createElement("div");
      empty.className = "muted";
      empty.textContent = "还没有同步过目录。";
      els.sourcesList.append(empty);
      return;
    }

    for (const source of sources) {
      const item = document.createElement("article");
      item.className = "source-item";
      const deviceName = source.devices?.name || source.device_name || "未知设备";
      const title = document.createElement("strong");
      title.textContent = `${deviceName} / ${source.name}`;
      const path = document.createElement("div");
      path.className = "muted";
      path.textContent = source.path_label || "无路径备注";
      const meta = document.createElement("div");
      meta.className = "muted";
      meta.textContent = `文件数：${source.file_count || 0}　上次同步：${formatDate(source.last_sync_at)}`;
      const actions = document.createElement("div");
      actions.className = "source-actions";
      const syncButton = document.createElement("button");
      syncButton.className = "small-button";
      syncButton.type = "button";
      syncButton.textContent = "一键同步";
      syncButton.addEventListener("click", () => resyncSource(source, meta));
      actions.append(syncButton);
      const editButton = document.createElement("button");
      editButton.className = "small-button";
      editButton.type = "button";
      editButton.textContent = "编辑路径";
      editButton.addEventListener("click", () => editSourcePath(source, path));
      actions.append(editButton);
      item.append(title, path, meta, actions);
      els.sourcesList.append(item);
    }
  } catch (error) {
    const empty = document.createElement("div");
    empty.className = "muted";
    empty.textContent = `加载失败：${error.message}`;
    els.sourcesList.append(empty);
  }
}

async function resyncSource(source, metaNode) {
  const deviceName = source.devices?.name || source.device_name || "";
  const pathLabel = String(source.path_label || "").trim();

  if (looksLikeAbsolutePath(pathLabel) && extensionState.installed) {
    metaNode.textContent = "正在通过本机 Helper 扫描路径...";
    const response = await sendExtensionMessage({
      type: "MOVIE_MANAGER_SCAN_DIRECTORY",
      path: pathLabel,
    });
    if (!response?.ok) {
      metaNode.textContent = response?.error || "本机 Helper 扫描失败。";
      return;
    }
    const result = await syncNativeScanResponse(response, {
      deviceName,
      sourceName: source.name,
      pathLabel,
      skipRemember: true,
    });
    if (!result) return;
    metaNode.textContent = `文件数：${result.count || 0}　上次同步：${formatDate(new Date().toISOString())}`;
    return;
  }

  let dirHandle = await getSourceHandle(deviceName, source.name);
  if (!dirHandle) {
    if (!window.showDirectoryPicker) {
      metaNode.textContent = "未保存目录授权，当前浏览器不支持一键绑定。";
      return;
    }
    try {
      metaNode.textContent = "未保存目录授权，请选择这个源对应的目录...";
      dirHandle = await window.showDirectoryPicker({ mode: "read" });
      await saveSourceHandle(deviceName, source.name, dirHandle);
    } catch (error) {
      if (error.name === "AbortError") {
        metaNode.textContent = "已取消目录绑定。";
        return;
      }
      metaNode.textContent = describeDirectoryPickerError(error);
      return;
    }
  }

  try {
    const granted = await ensureDirectoryPermission(dirHandle);
    if (!granted) {
      metaNode.textContent = "目录权限不可用，已忽略。";
      return;
    }

    metaNode.textContent = "一键同步中...";
    const files = [];
    const scanStats = createScanStats();
    await walkDirectoryHandle(dirHandle, "", files, scanStats);
    const result = await syncFiles(files, "picker", {
      deviceName,
      sourceName: source.name,
      pathLabel: source.path_label || "",
      skipRemember: true,
      scanStats,
    });
    if (!result) return;
    metaNode.textContent = `文件数：${result.count || 0}　上次同步：${formatDate(new Date().toISOString())}`;
  } catch (error) {
    metaNode.textContent = `源不可访问，已忽略：${error.message}`;
  }
}

function describeDirectoryPickerError(error) {
  const message = error?.message || "";
  if (/system files|sensitive|not allowed|can't open/i.test(message)) {
    return "浏览器不允许授权这个目录。请选它下面的子目录，或用“兼容模式选择目录”做普通同步。";
  }
  return `扫描失败：${message || "未知错误"}`;
}

async function ensureDirectoryPermission(dirHandle) {
  if (!dirHandle.queryPermission || !dirHandle.requestPermission) return true;
  const options = { mode: "read" };
  if (await dirHandle.queryPermission(options) === "granted") return true;
  return await dirHandle.requestPermission(options) === "granted";
}

function sourceHandleKey(deviceName, sourceName) {
  return `${deviceName}\n${sourceName}`;
}

function openHandleDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(HANDLE_DB_NAME, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(HANDLE_STORE_NAME, { keyPath: "key" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function saveSourceHandle(deviceName, sourceName, dirHandle) {
  const db = await openHandleDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(HANDLE_STORE_NAME, "readwrite");
    tx.objectStore(HANDLE_STORE_NAME).put({
      key: sourceHandleKey(deviceName, sourceName),
      deviceName,
      sourceName,
      dirHandle,
      savedAt: new Date().toISOString(),
    });
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
  });
}

async function getSourceHandle(deviceName, sourceName) {
  const db = await openHandleDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(HANDLE_STORE_NAME, "readonly");
    const request = tx.objectStore(HANDLE_STORE_NAME).get(sourceHandleKey(deviceName, sourceName));
    request.onsuccess = () => resolve(request.result?.dirHandle || null);
    request.onerror = () => reject(request.error);
    tx.oncomplete = () => db.close();
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
  });
}

async function editSourcePath(source, pathNode) {
  const nextPath = window.prompt("输入这个目录的真实根路径，留空则清除路径备注：", source.path_label || "");
  if (nextPath === null) return;

  try {
    await store.updateSourcePath(source.id, nextPath.trim());
    source.path_label = nextPath.trim();
    pathNode.textContent = source.path_label || "无路径备注";
  } catch (error) {
    pathNode.textContent = `更新失败：${error.message}`;
  }
}

function setSyncStatus(text) {
  els.syncStatus.textContent = text;
}

function toast(text) {
  setSyncStatus(text);
}

function createStore(settings) {
  if (shouldUseApi(settings)) return createApiStore(settings);
  return createDemoStore();
}

function shouldUseApi(settings) {
  if (settings.apiBaseUrl) return true;
  if (location.protocol === "chrome-extension:") return false;
  return location.protocol === "https:" && !["localhost", "127.0.0.1"].includes(location.hostname);
}

function createApiStore({ apiBaseUrl = "" }) {
  const baseUrl = apiBaseUrl.replace(/\/$/, "");

  async function request(path, options = {}) {
    const response = await fetch(`${baseUrl}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(options.headers || {}),
      },
    });
    if (!response.ok) {
      const body = await response.text();
      throw new Error(body || `${response.status} ${response.statusText}`);
    }
    if (response.status === 204) return null;
    return response.json();
  }

  return {
    async replaceSourceSnapshot({ deviceName, sourceName, pathLabel, files }) {
      if (!files.length) {
        await request("/api/sync", {
          method: "POST",
          body: JSON.stringify({
            deviceName,
            sourceName,
            pathLabel,
            files: [],
            resetSource: true,
            isFinalBatch: true,
            processedCount: 0,
          }),
        });
        return { count: 0, skippedCount: 0 };
      }

      const favoriteHints = await favoriteSyncHints();
      let processed = 0;
      let skippedCount = 0;
      for (let i = 0; i < files.length; i += REMOTE_SYNC_CHUNK_SIZE) {
        const chunk = files.slice(i, i + REMOTE_SYNC_CHUNK_SIZE);
        processed += chunk.length;
        const result = await request("/api/sync", {
          method: "POST",
          body: JSON.stringify({
            deviceName,
            sourceName,
            pathLabel,
            files: chunk,
            resetSource: i === 0,
            isFinalBatch: processed === files.length,
            processedCount: processed,
            totalCount: files.length,
            ...favoriteHints,
          }),
        });
        skippedCount += result?.skippedCount || 0;
        setSyncStatus(`正在上传 ${processed}/${files.length} 个视频文件...`);
      }
      return { count: processed - skippedCount, skippedCount };
    },

    async search(query, page = 0) {
      const offset = page * 10;
      const apiQuery = normalizeApiSearchQuery(query);
      const result = await request(`/api/search?q=${encodeURIComponent(apiQuery)}&offset=${encodeURIComponent(offset)}`);
      if (!Array.isArray(result)) return normalizeExactCodeResult(query, result);
      return {
        rows: result,
        pageSize: result.length,
        page,
        total: result.length,
        totalPages: 1,
        hasMore: false,
      };
    },

    async listFavorites() {
      return request("/api/favorites");
    },

    async setFavorite(fileId, isFavorite) {
      return request("/api/favorites", {
        method: "PATCH",
        body: JSON.stringify({ fileId, isFavorite }),
      });
    },

    async listSources() {
      return request("/api/sources");
    },

    async updateSourcePath(sourceId, pathLabel) {
      return request("/api/sources", {
        method: "PATCH",
        body: JSON.stringify({ sourceId, pathLabel }),
      });
    },
  };
}

async function favoriteSyncHints() {
  try {
    const rows = await store.listFavorites();
    return {
      favoriteNames: rows.map((row) => row.filename).filter(Boolean),
      favoriteCodes: rows.map((row) => row.code || extractCode(row.filename)).filter(Boolean),
    };
  } catch {
    return { favoriteNames: [], favoriteCodes: [] };
  }
}

function createDemoStore() {
  function readDb() {
    try {
      return JSON.parse(localStorage.getItem(DEMO_KEY) || '{"devices":[],"sources":[],"files":[]}');
    } catch {
      return { devices: [], sources: [], files: [] };
    }
  }

  function writeDb(db) {
    localStorage.setItem(DEMO_KEY, JSON.stringify(db));
  }

  function id() {
    return crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random());
  }

  return {
    async replaceSourceSnapshot({ deviceName, sourceName, pathLabel, files }) {
      const db = readDb();
      let device = db.devices.find((item) => item.name === deviceName);
      if (!device) {
        device = { id: id(), name: deviceName, created_at: new Date().toISOString() };
        db.devices.push(device);
      }
      let source = db.sources.find((item) => item.device_id === device.id && item.name === sourceName);
      if (!source) {
        source = { id: id(), device_id: device.id, name: sourceName, created_at: new Date().toISOString() };
        db.sources.push(source);
      }
      const now = new Date().toISOString();
      source.path_label = pathLabel;
      source.last_sync_at = now;
      source.file_count = files.length;
      device.last_sync_at = now;
      const favoriteNames = new Set(db.files
        .filter((file) => file.is_favorite)
        .map((file) => file.filename));
      const favoriteCodes = new Set(db.files
        .filter((file) => file.is_favorite)
        .map((file) => file.code || extractCode(file.filename))
        .filter(Boolean));
      const incomingNames = new Set(files.map((file) => file.filename));
      db.files = db.files.filter((file) => {
        if (file.device_id !== device.id) return true;
        if (file.source_id === source.id) return false;
        return !incomingNames.has(file.filename);
      });
      db.files.push(...files.map((file) => ({
        ...file,
        id: id(),
        device_id: device.id,
        source_id: source.id,
        is_favorite: favoriteNames.has(file.filename) || (file.code && favoriteCodes.has(file.code)),
        last_seen_at: now,
      })));
      writeDb(db);
      return { count: files.length, skippedCount: 0 };
    },

    async search(query, page = 0) {
      const db = readDb();
      const code = normalizeCode(query);
      const tokens = queryTokens(query);
      const files = db.files
        .map((file) => attachDemoRelations(db, file))
        .filter((file) => {
          if (code && isExactCodeQuery(tokens, code) && file.code === code) return true;
          return matchesQueryTokens(file, tokens);
        });
      const rows = files.sort((a, b) => String(b.last_seen_at).localeCompare(String(a.last_seen_at)));
      const pageSize = 10;
      const offset = page * pageSize;
      const total = rows.length;
      return {
        rows: rows.slice(offset, offset + pageSize),
        pageSize,
        page,
        total,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
        nextOffset: offset + pageSize,
        hasMore: offset + pageSize < rows.length,
      };
    },

    async listFavorites() {
      const db = readDb();
      return db.files
        .filter((file) => file.is_favorite)
        .map((file) => attachDemoRelations(db, file))
        .sort((a, b) => String(b.last_seen_at).localeCompare(String(a.last_seen_at)));
    },

    async setFavorite(fileId, isFavorite) {
      const db = readDb();
      const file = db.files.find((item) => item.id === fileId);
      if (!file) throw new Error("File not found");
      file.is_favorite = Boolean(isFavorite);
      writeDb(db);
      return attachDemoRelations(db, file);
    },

    async listSources() {
      const db = readDb();
      return db.sources.map((source) => {
        const device = db.devices.find((item) => item.id === source.device_id);
        return {
          ...source,
          devices: device,
          file_count: db.files.filter((file) => file.source_id === source.id).length,
        };
      });
    },

    async updateSourcePath(sourceId, pathLabel) {
      const db = readDb();
      const source = db.sources.find((item) => item.id === sourceId);
      if (!source) throw new Error("Source not found");
      source.path_label = pathLabel;
      writeDb(db);
      return source;
    },
  };
}

function attachDemoRelations(db, file) {
  const source = db.sources.find((item) => item.id === file.source_id) || {};
  const device = db.devices.find((item) => item.id === file.device_id) || {};
  return { ...file, sources: { ...source, devices: device } };
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

function queryTokens(query) {
  const parts = String(query)
    .toLowerCase()
    .split(/[\s._,，、;；|/\\()[\]{}]+/)
    .filter(Boolean);
  const compact = parts.join("");
  return { compact, parts: parts.slice(0, 8) };
}

function matchesQueryTokens(file, tokens) {
  const text = [
    file?.filename,
    file?.relative_path,
    file?.code,
    file?.source_name,
    file?.device_name,
    file?.sources?.name,
    file?.sources?.path_label,
    file?.sources?.devices?.name,
  ].filter(Boolean).join(" ").toLowerCase();
  const compactText = text.replace(/[^a-z0-9]+/g, "");
  if (tokens.compact && compactText.includes(tokens.compact)) return true;
  return tokens.parts.length > 0 && tokens.parts.every((token) => text.includes(token));
}

function isExactCodeQuery(tokens, code) {
  if (!code || tokens.parts?.length !== 1) return false;
  return normalizeCode(tokens.parts[0]) === code;
}

function normalizeApiSearchQuery(query) {
  const code = normalizeCode(query);
  if (!code || !isExactCodeQuery(queryTokens(query), code)) return query;
  return code.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function normalizeExactCodeResult(query, result) {
  const code = normalizeCode(query);
  if (!code || !isExactCodeQuery(queryTokens(query), code) || !Array.isArray(result?.rows)) return result;
  const allRowsMatch = result.rows.every((row) => (row.code || extractCode(row.filename)) === code);
  if (allRowsMatch) return result;
  return {
    ...result,
    rows: [],
    page: 0,
    total: 0,
    totalPages: 1,
    hasMore: false,
  };
}

function normalizeCode(text) {
  return extractCode(String(text || "").trim());
}

function joinDisplayPath(pathLabel, relativePath) {
  if (!pathLabel) return relativePath;
  const separator = pathLabel.includes("\\") ? "\\" : "/";
  return `${pathLabel.replace(/[\\/]+$/, "")}${separator}${relativePath.replace(/^[\\/]+/, "")}`;
}

function formatBytes(bytes) {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = Number(bytes);
  let index = 0;
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index += 1;
  }
  return `${value.toFixed(value >= 10 || index === 0 ? 0 : 1)} ${units[index]}`;
}

function formatDate(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function escapeHtml(text) {
  return String(text || "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  })[char]);
}

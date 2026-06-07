const VIDEO_SUFFIXES = new Set(["mp4", "ts", "mkv", "avi", "mov", "wmv", "flv", "m4v"]);
const SETTINGS_KEY = "movie-manager:settings";
const DEMO_KEY = "movie-manager:demo-db";
const LOCAL_DEVICE_ID_KEY = "movie-manager:local-device-id";
const REMOTE_SYNC_CHUNK_SIZE = 500;

const els = {
  settingsToggle: document.querySelector("#settingsToggle"),
  settingsPanel: document.querySelector("#settingsPanel"),
  storageMode: document.querySelector("#storageMode"),
  apiBaseUrl: document.querySelector("#apiBaseUrl"),
  syncToken: document.querySelector("#syncToken"),
  saveSettings: document.querySelector("#saveSettings"),
  clearSettings: document.querySelector("#clearSettings"),
  tabs: document.querySelectorAll(".tab"),
  views: {
    search: document.querySelector("#searchTab"),
    sync: document.querySelector("#syncTab"),
    sources: document.querySelector("#sourcesTab"),
  },
  searchForm: document.querySelector("#searchForm"),
  searchInput: document.querySelector("#searchInput"),
  searchMeta: document.querySelector("#searchMeta"),
  results: document.querySelector("#results"),
  deviceName: document.querySelector("#deviceName"),
  sourceName: document.querySelector("#sourceName"),
  pathLabel: document.querySelector("#pathLabel"),
  pickDirectory: document.querySelector("#pickDirectory"),
  directoryInput: document.querySelector("#directoryInput"),
  syncStatus: document.querySelector("#syncStatus"),
  refreshSources: document.querySelector("#refreshSources"),
  sourcesList: document.querySelector("#sourcesList"),
  resultTemplate: document.querySelector("#resultTemplate"),
};

let store = createStore(loadSettings());
let extensionState = { installed: false };

init();

function init() {
  const settings = loadSettings();
  els.apiBaseUrl.value = settings.apiBaseUrl || "";
  els.syncToken.value = settings.syncToken || "";
  updateStorageMode();
  restoreSyncForm();
  detectExtension();

  els.settingsToggle.addEventListener("click", () => {
    els.settingsPanel.classList.toggle("hidden");
  });

  els.saveSettings.addEventListener("click", () => {
    saveSettings({
      apiBaseUrl: els.apiBaseUrl.value.trim(),
      syncToken: els.syncToken.value.trim(),
    });
    store = createStore(loadSettings());
    updateStorageMode();
    toast("Supabase 配置已保存。");
  });

  els.clearSettings.addEventListener("click", () => {
    localStorage.removeItem(SETTINGS_KEY);
    els.apiBaseUrl.value = "";
    els.syncToken.value = "";
    store = createStore({});
    updateStorageMode();
    toast("已切换到本地 demo 存储。");
  });

  els.tabs.forEach((tab) => {
    tab.addEventListener("click", () => showTab(tab.dataset.tab));
  });

  els.searchForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    await runSearch();
  });

  els.pickDirectory.addEventListener("click", syncWithDirectoryPicker);
  els.directoryInput.addEventListener("change", async () => {
    if (!els.directoryInput.files.length) return;
    const files = Array.from(els.directoryInput.files);
    applySelectedDirectoryName(getRootDirectoryName(files));
    await syncFiles(files, "webkit");
    els.directoryInput.value = "";
  });
  els.refreshSources.addEventListener("click", renderSources);
}

function loadSettings() {
  try {
    return JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}");
  } catch {
    return {};
  }
}

function saveSettings(settings) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
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
}

async function runSearch() {
  const query = els.searchInput.value.trim();
  if (!query) {
    renderEmpty("输入一个番号或文件名。");
    return;
  }

  els.searchMeta.textContent = "搜索中...";
  try {
    const rows = await store.search(query);
    const code = normalizeCode(query);
    els.searchMeta.textContent = code
      ? `已按 ${code} 搜索，找到 ${rows.length} 个位置。`
      : `已按文件名搜索，找到 ${rows.length} 个候选。`;
    renderResults(rows);
  } catch (error) {
    els.searchMeta.textContent = "搜索失败。";
    renderEmpty(error.message);
  }
}

function renderResults(rows) {
  els.results.replaceChildren();
  if (!rows.length) {
    renderEmpty("没有找到。可以去同步页更新这台设备的目录索引。");
    return;
  }

  for (const row of rows) {
    const node = els.resultTemplate.content.firstElementChild.cloneNode(true);
    const title = node.querySelector("h3");
    const subtitle = node.querySelector(".muted");
    const path = node.querySelector(".result-path");
    const footer = node.querySelector(".result-footer");
    const source = row.sources || {};
    const device = source.devices || {};
    const displayPath = joinDisplayPath(source.path_label, row.relative_path);
    const canOpenLocal = extensionState.installed && isCurrentDevice(device.name || row.device_name);

    title.textContent = row.code || extractCode(row.filename) || "未识别番号";
    subtitle.textContent = `${device.name || row.device_name || "未知设备"} / ${source.name || row.source_name || "未知目录"}`;
    path.textContent = displayPath || row.relative_path || row.filename;
    footer.innerHTML = "";
    footer.append(metaItem(row.filename));
    footer.append(metaItem(formatBytes(row.size_bytes)));
    footer.append(metaItem(`修改：${formatDate(row.mtime)}`));
    footer.append(metaItem(`同步：${formatDate(row.last_seen_at || source.last_sync_at)}`));
    if (canOpenLocal) {
      const openButton = document.createElement("button");
      openButton.className = "small-button";
      openButton.type = "button";
      openButton.textContent = "本机打开";
      openButton.addEventListener("click", () => requestLocalOpen(row, displayPath));
      footer.append(openButton);
    }
    els.results.append(node);
  }
}

function isCurrentDevice(deviceName) {
  return Boolean(deviceName) && deviceName === els.deviceName.value.trim();
}

async function detectExtension() {
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

function sendExtensionMessage(message) {
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
  if (!window.showDirectoryPicker) {
    toast("当前浏览器不支持目录选择器，请使用兼容模式。");
    return;
  }

  try {
    const dirHandle = await window.showDirectoryPicker({ mode: "read" });
    applySelectedDirectoryName(dirHandle.name);
    const files = [];
    await walkDirectoryHandle(dirHandle, "", files);
    await syncFiles(files, "picker");
  } catch (error) {
    if (error.name === "AbortError") return;
    setSyncStatus(`扫描失败：${error.message}`);
  }
}

async function walkDirectoryHandle(dirHandle, prefix, files) {
  for await (const [name, handle] of dirHandle.entries()) {
    if (name.startsWith(".")) continue;
    const relativePath = prefix ? `${prefix}/${name}` : name;
    if (handle.kind === "directory") {
      await walkDirectoryHandle(handle, relativePath, files);
      continue;
    }
    if (!isVideoFile(name)) continue;
    const file = await handle.getFile();
    files.push({ file, relativePath });
    if (files.length % 500 === 0) setSyncStatus(`已扫描 ${files.length} 个视频文件...`);
  }
}

async function syncFiles(inputFiles, mode) {
  const deviceName = els.deviceName.value.trim();
  const sourceName = els.sourceName.value.trim() || "Selected Directory";
  const pathLabel = els.pathLabel.value.trim();

  if (!deviceName) {
    setSyncStatus("请先确认设备名。");
    return;
  }

  rememberSyncForm();
  const rows = dedupeFilesByName(inputFiles
    .map((entry) => normalizeFileEntry(entry, mode))
    .filter((entry) => entry && isVideoFile(entry.filename)));

  setSyncStatus(`准备同步 ${rows.length} 个视频文件...`);

  try {
    const result = await store.replaceSourceSnapshot({ deviceName, sourceName, pathLabel, files: rows });
    setSyncStatus(`同步完成：${result.count} 个文件已更新到 ${deviceName} / ${sourceName}。`);
  } catch (error) {
    setSyncStatus(`同步失败：${error.message}`);
  }
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
  return location.protocol === "https:" && !["localhost", "127.0.0.1"].includes(location.hostname);
}

function createApiStore({ apiBaseUrl = "", syncToken = "" }) {
  const baseUrl = apiBaseUrl.replace(/\/$/, "");

  async function request(path, options = {}) {
    const response = await fetch(`${baseUrl}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(syncToken ? { "x-sync-token": syncToken } : {}),
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
        return { count: 0 };
      }

      let processed = 0;
      for (let i = 0; i < files.length; i += REMOTE_SYNC_CHUNK_SIZE) {
        const chunk = files.slice(i, i + REMOTE_SYNC_CHUNK_SIZE);
        processed += chunk.length;
        await request("/api/sync", {
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
          }),
        });
        setSyncStatus(`正在上传 ${processed}/${files.length} 个视频文件...`);
      }
      return { count: processed };
    },

    async search(query) {
      return request(`/api/search?q=${encodeURIComponent(query)}`);
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
      const incomingNames = new Set(files.map((file) => file.filename));
      db.files = db.files.filter((file) => {
        if (file.device_id !== device.id) return true;
        if (file.source_id === source.id) return false;
        return !incomingNames.has(file.filename);
      });
      db.files.push(...files.map((file) => ({ ...file, id: id(), device_id: device.id, source_id: source.id, last_seen_at: now })));
      writeDb(db);
      return { count: files.length };
    },

    async search(query) {
      const db = readDb();
      const code = normalizeCode(query);
      const tokens = queryTokens(query);
      const files = db.files
        .filter((file) => {
          if (code && file.code === code) return true;
          return matchesQueryTokens(file.filename, tokens);
        })
        .map((file) => attachDemoRelations(db, file));
      return files.sort((a, b) => String(b.last_seen_at).localeCompare(String(a.last_seen_at)));
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
  if (!filename || filename.startsWith(".") || !filename.includes(".")) return false;
  const ext = filename.split(".").pop().toLowerCase();
  return VIDEO_SUFFIXES.has(ext);
}

function extractCode(filename) {
  const base = filename.replace(/\.[^.]+$/, "");
  const match = base.match(/(?:^|[^a-z0-9])([a-z]{2,8})[\s._-]*0*([0-9]{2,6})(?:[^a-z0-9]|$)/i)
    || base.match(/^([a-z]{2,8})0*([0-9]{2,6})$/i);
  if (!match) return null;
  return `${match[1].toUpperCase()}-${match[2]}`;
}

function queryTokens(query) {
  const parts = String(query).toLowerCase().split(/[\s._-]+/).filter(Boolean);
  const compact = parts.join("");
  return { compact, parts: parts.slice(0, 4) };
}

function matchesQueryTokens(filename, tokens) {
  const text = String(filename || "").toLowerCase();
  if (tokens.compact && text.includes(tokens.compact)) return true;
  return tokens.parts.length > 0 && tokens.parts.every((token) => text.includes(token));
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

const NATIVE_HOST = "com.movie_manager.helper";

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  handleMessage(message).then(sendResponse);
  return true;
});

async function handleMessage(message) {
  if (message?.type === "MOVIE_MANAGER_PING") {
    return { ok: true, version: chrome.runtime.getManifest().version };
  }

  if (message?.type === "MOVIE_MANAGER_OPEN_LOCAL") {
    return openLocalFile(message.file);
  }

  if (message?.type === "MOVIE_MANAGER_NATIVE_STATUS") {
    return checkNativeHelper();
  }

  if (message?.type === "MOVIE_MANAGER_SCAN_DIRECTORY") {
    return scanDirectory(message.path);
  }

  return { ok: false, error: "Unknown message type" };
}

async function scanDirectory(path) {
  if (!path) return { ok: false, error: "Missing directory path" };

  try {
    return await sendNativeMessage({
      type: "SCAN_DIRECTORY",
      path,
    });
  } catch (error) {
    return {
      ok: false,
      error: `Native helper 调用失败：${error.message}`,
      detail: error.message,
    };
  }
}

async function checkNativeHelper() {
  try {
    return await sendNativeMessage({ type: "PING_HELPER" });
  } catch (error) {
    return {
      ok: false,
      error: `Native helper 调用失败：${error.message}`,
      detail: error.message,
    };
  }
}

async function openLocalFile(file) {
  if (!file?.relativePath) return { ok: false, error: "Missing file path" };

  try {
    const response = await sendNativeMessage({
      type: "OPEN_LOCAL_FILE",
      file,
    });
    return response;
  } catch (error) {
    return {
      ok: false,
      error: `Native helper 调用失败：${error.message}`,
      detail: error.message,
    };
  }
}

function sendNativeMessage(message) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendNativeMessage(NATIVE_HOST, message, (response) => {
      const error = chrome.runtime.lastError;
      if (error) {
        reject(new Error(error.message));
        return;
      }
      resolve(response || { ok: false, error: "Native helper returned no response" });
    });
  });
}

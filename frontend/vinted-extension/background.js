importScripts("background-core.js");

const bridgeApi = globalThis.VintedAssistantBackground.createBridgeApi(
  fetch,
  undefined,
  chrome.runtime.id,
);

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  void bridgeApi.handleMessage(message, sender).then(
    (data) => {
      sendResponse({ ok: true, data });
    },
    (error) => {
      sendResponse({
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      });
    },
  );
  return true;
});

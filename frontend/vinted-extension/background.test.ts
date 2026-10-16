import { beforeEach, describe, expect, it, vi } from "vitest";

type Listener = (
  message: Record<string, unknown>,
  sender: unknown,
  sendResponse: (response: unknown) => void,
) => boolean;

const RUNTIME_ID = "vinted-assistant-extension";
const message = {
  type: "get-listing",
  listingId: "9f42a8b2-17d6-4725-943f-7d45e93bed8b",
};
const sender = {
  id: RUNTIME_ID,
  frameId: 0,
  url: `https://www.vinted.it/items/new#vinted-assistant=${message.listingId}`,
};

describe("Vinted Assistant service worker", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("keeps the message channel open and forwards Chrome sender identity", async () => {
    let listener: Listener | undefined;
    const handleMessage = vi.fn().mockResolvedValue({ id: message.listingId });
    const createBridgeApi = vi.fn(() => ({ handleMessage }));
    vi.stubGlobal("importScripts", vi.fn());
    vi.stubGlobal("VintedAssistantBackground", { createBridgeApi });
    vi.stubGlobal("chrome", {
      runtime: {
        id: RUNTIME_ID,
        onMessage: {
          addListener: (registered: Listener) => {
            listener = registered;
          },
        },
      },
    });

    await import("./background.js");
    expect(listener).toBeDefined();
    expect(createBridgeApi).toHaveBeenCalledWith(fetch, undefined, RUNTIME_ID);
    const sendResponse = vi.fn();

    expect(listener!(message, sender, sendResponse)).toBe(true);
    expect(handleMessage).toHaveBeenCalledWith(message, sender);
    await vi.waitFor(() => {
      expect(sendResponse).toHaveBeenCalledWith({
        ok: true,
        data: { id: message.listingId },
      });
    });
  });

  it("returns bridge failures to the content script", async () => {
    let listener: Listener | undefined;
    const handleMessage = vi.fn().mockRejectedValue(new Error("API locale non raggiungibile"));
    vi.stubGlobal("importScripts", vi.fn());
    vi.stubGlobal("VintedAssistantBackground", {
      createBridgeApi: () => ({ handleMessage }),
    });
    vi.stubGlobal("chrome", {
      runtime: {
        id: RUNTIME_ID,
        onMessage: {
          addListener: (registered: Listener) => {
            listener = registered;
          },
        },
      },
    });

    await import("./background.js");
    const sendResponse = vi.fn();
    expect(listener!(message, sender, sendResponse)).toBe(true);

    await vi.waitFor(() => {
      expect(sendResponse).toHaveBeenCalledWith({
        ok: false,
        error: "API locale non raggiungibile",
      });
    });
  });
});

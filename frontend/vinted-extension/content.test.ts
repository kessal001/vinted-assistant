// @vitest-environment-options {"url":"https://www.vinted.it/items/new"}

import { fireEvent, getByRole, waitFor } from "@testing-library/dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import "./bridge-core.js";

const listingId = "9f42a8b2-17d6-4725-943f-7d45e93bed8b";
const selectedUrl = `/items/new#vinted-assistant=${listingId}`;
const changedTargets = [
  ["selected UUID", "/items/new#vinted-assistant=11111111-1111-4111-8111-111111111111"],
  ["pathname", `/items/123#vinted-assistant=${listingId}`],
  ["duplicate selection", `${selectedUrl}&vinted-assistant=${listingId}`],
] as const;
const photoPayload = {
  filename: "fixture.jpg", content_type: "image/jpeg", base64: "Zm90bw==",
};
const listing = {
  id: listingId,
  photo_urls: ["/uploads/0123456789abcdef0123456789abcdef.jpg"],
  item_type: "maglietta",
  brand: "Uniqlo",
  size: "M",
  title: "Titolo pronto",
  description: "Descrizione pronta",
  category: "Donna > Abbigliamento",
  condition: "Ottime condizioni",
  price: 12.5,
  parcel_size: "Piccolo",
  status: "ready",
};

function successfulReply(message: { type: string }) {
  if (message.type === "get-listing") return listing;
  if (message.type === "get-photo") return photoPayload;
  throw new Error("unexpected message");
}

function deferred() {
  let resolve!: (value: unknown) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<unknown>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

async function mountedPanel() {
  return waitFor(() => {
    const panel = document.querySelector<HTMLElement>("#vinted-assistant-bridge");
    expect(panel).not.toBeNull();
    return panel!;
  });
}

function fieldValues() {
  return Array.from(document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(
    "#title, #description, #category, #brand, #size, #condition, #price, #parcel",
  ), (control) => control.value);
}

async function settle() {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe("Vinted Assistant content bridge", () => {
  beforeEach(() => {
    vi.resetModules();
    // Only the FileList construction seam is mocked; a real-browser regression
    // verifies that the page's JS world and FormData receive the actual file.
    vi.spyOn(HTMLInputElement.prototype, "files", "set").mockImplementation(function (
      this: HTMLInputElement, value: FileList | null,
    ) {
      Object.defineProperty(this, "files", { configurable: true, value });
    });
    document.body.innerHTML = `
      <label for="title">Titolo</label><input id="title" />
      <label for="description">Descrizione</label><textarea id="description"></textarea>
      <label for="category">Categoria</label><input id="category" />
      <label for="brand">Marca</label><input id="brand" />
      <label for="size">Taglia</label><input id="size" />
      <label for="condition">Condizione</label>
      <select id="condition"><option>Ottime condizioni</option></select>
      <label for="price">Prezzo</label><input id="price" type="number" />
      <label for="parcel">Dimensione pacco</label>
      <select id="parcel"><option>Piccolo</option></select>
      <input id="photos" type="file" multiple />
      <button id="publish">Pubblica</button>
    `;
    window.history.replaceState(null, "", selectedUrl);

    class FakeDataTransfer {
      private stored: File[] = [];
      items = { add: (file: File) => this.stored.push(file) };
      files: { readonly length: number; item(index: number): File | null };

      constructor() {
        const stored = this.stored;
        this.files = {
          get length() {
            return stored.length;
          },
          item(index: number) {
            return stored[index] ?? null;
          },
        };
      }
    }
    vi.stubGlobal("DataTransfer", FakeDataTransfer);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    window.history.replaceState(null, "", "/items/123");
    window.dispatchEvent(new PopStateEvent("popstate"));
    document.body.replaceChildren();
    vi.useRealTimers();
  });

  it("loads the selected draft, fills the official form, and never publishes", async () => {
    const publishClick = vi.fn();
    document.querySelector("#publish")?.addEventListener("click", publishClick);
    const sendMessage = vi.fn(async (message: { type: string }) => {
      if (message.type === "get-listing") return listing;
      if (message.type === "get-photo") {
        return {
          filename: "0123456789abcdef0123456789abcdef.jpg",
          content_type: "image/jpeg",
          base64: "Zm90bw==",
        };
      }
      if (message.type === "mark-draft") {
        return { ...listing, status: "vinted_draft" };
      }
      throw new Error("unexpected message");
    });
    vi.stubGlobal("chrome", { runtime: { sendMessage } });

    await import("./content.js");

    const panel = await waitFor(() => {
      const found = document.querySelector<HTMLElement>("#vinted-assistant-bridge");
      expect(found).not.toBeNull();
      return found!;
    });
    expect(panel.textContent).toContain("Titolo pronto");

    const fillButton = Array.from(panel.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("Compila campi e foto"),
    );
    expect(fillButton).toBeDefined();
    fireEvent.click(fillButton!);

    await waitFor(() => {
      expect((document.querySelector("#title") as HTMLInputElement).value).toBe(
        "Titolo pronto",
      );
      expect((document.querySelector("#photos") as HTMLInputElement).files).toHaveLength(
        1,
      );
    });
    expect(publishClick).not.toHaveBeenCalled();
    expect(sendMessage).toHaveBeenCalledWith({
      type: "get-photo",
      listingId,
      path: listing.photo_urls[0],
    });

    const draftButton = Array.from(panel.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("Segna come bozza Vinted"),
    );
    expect(draftButton).toBeDefined();
    expect(draftButton).toBeDisabled();
    const confirmation = panel.querySelector<HTMLInputElement>('input[type="checkbox"]');
    expect(confirmation).not.toBeNull();
    fireEvent.click(confirmation!);
    expect(draftButton).not.toBeDisabled();
    fireEvent.click(draftButton!);
    await waitFor(() => {
      expect(panel.textContent).toContain("Stato aggiornato: Bozza Vinted");
    });
    expect(sendMessage).toHaveBeenCalledWith({
      type: "mark-draft",
      listingId,
      confirmedSaved: true,
    });
    expect(publishClick).not.toHaveBeenCalled();
  });

  it("shows copyable values for readonly selectors without claiming they are filled", async () => {
    (document.querySelector("#category") as HTMLInputElement).readOnly = true;
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    vi.stubGlobal("chrome", { runtime: { sendMessage: vi.fn(async (message: { type: string }) => {
      if (message.type === "get-listing") return listing;
      if (message.type === "get-photo") return {
        filename: "fixture.jpg", content_type: "image/jpeg", base64: "Zm90bw==",
      };
      throw new Error("unexpected message");
    }) } });
    await import("./content.js");
    const panel = await waitFor(() => {
      const node = document.querySelector<HTMLElement>("#vinted-assistant-bridge");
      expect(node).not.toBeNull();
      return node!;
    });
    fireEvent.click(getByRole(panel, "button", { name: "Compila campi e foto" }));
    await waitFor(() => expect(getByRole(panel, "status")).toHaveTextContent("Completa manualmente: Categoria"));
    expect(document.querySelector<HTMLInputElement>("#category")?.value).toBe("");
    const details = panel.querySelector("details");
    expect(details).not.toHaveAttribute("hidden");
    expect(details).toHaveTextContent(listing.category);
    fireEvent.click(getByRole(panel, "button", { name: "Copia Categoria" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(listing.category));
  });

  it("does not upload the same photos again when refilling newly revealed fields", async () => {
    const photoChange = vi.fn();
    document.querySelector("#photos")!.addEventListener("change", photoChange);
    const sendMessage = vi.fn(async (message: { type: string }) => {
      if (message.type === "get-listing") return listing;
      if (message.type === "get-photo") return {
        filename: "fixture.jpg", content_type: "image/jpeg", base64: "Zm90bw==",
      };
      throw new Error("unexpected message");
    });
    vi.stubGlobal("chrome", { runtime: { sendMessage } });
    await import("./content.js");
    const button = await waitFor(() => getByRole(document.body, "button", { name: "Compila campi e foto" }));
    fireEvent.click(button);
    await waitFor(() => {
      expect(button).not.toBeDisabled();
      expect(photoChange).toHaveBeenCalledTimes(1);
    });
    sendMessage.mockClear();
    document.querySelector<HTMLInputElement>("#title")!.value = "";
    fireEvent.click(button);
    await waitFor(() => expect(button).not.toBeDisabled());
    expect(document.querySelector<HTMLInputElement>("#title")!.value).toBe(listing.title);
    expect(photoChange).toHaveBeenCalledTimes(1);
    expect(sendMessage).not.toHaveBeenCalled();
  });

  describe.each([false, true])("target drift with photos already sent: %s", (refill) => {
    it.each(changedTargets)("does not write fields, attach photos, or send messages after changing %s", async (_name, url) => {
      const sendMessage = vi.fn(async (message: { type: string }) => successfulReply(message));
      vi.stubGlobal("chrome", { runtime: { sendMessage } });
      const photos = document.querySelector<HTMLInputElement>("#photos")!;
      const photoChange = vi.fn();
      photos.addEventListener("change", photoChange);
      await import("./content.js");
      const panel = await mountedPanel();
      const button = getByRole(panel, "button", { name: "Compila campi e foto" });
      if (refill) {
        fireEvent.click(button);
        await waitFor(() => {
          expect(button).not.toBeDisabled();
          expect(photoChange).toHaveBeenCalledTimes(1);
        });
      }
      sendMessage.mockClear();
      photoChange.mockClear();
      document.querySelector<HTMLInputElement>("#title")!.value = "Altro annuncio";
      document.querySelector<HTMLTextAreaElement>("#description")!.value = "Altra descrizione";
      const values = fieldValues();
      const files = photos.files;
      window.history.replaceState(null, "", url);
      fireEvent.click(button);
      await settle();
      expect(fieldValues()).toEqual(values);
      expect(photos.files).toBe(files);
      expect(photoChange).not.toHaveBeenCalled();
      expect(sendMessage).not.toHaveBeenCalled();
      expect(panel.isConnected).toBe(false);
      expect(button).toBeDisabled();

      window.history.replaceState(null, "", selectedUrl);
      fireEvent.click(button);
      await settle();
      expect(fieldValues()).toEqual(values);
      expect(sendMessage).not.toHaveBeenCalled();
      expect(panel.isConnected).toBe(false);
    });
  });

  it.each([
    `http://www.vinted.it${selectedUrl}`,
    `https://vinted.it${selectedUrl}`,
    `https://www.vinted.it.evil.example${selectedUrl}`,
    `https://www.vinted.it:8443${selectedUrl}`,
    `https://user:password@www.vinted.it${selectedUrl}`,
    `https://www.vinted.it/items/new/#vinted-assistant=${listingId}`,
    `https://www.vinted.it${selectedUrl}&vinted-assistant=${listingId}`,
    "https://www.vinted.it/items/new#vinted-assistant=not-a-uuid",
  ])("does not request or mount a draft on an invalid initial target: %s", async (url) => {
    vi.stubGlobal("location", new URL(url));
    const sendMessage = vi.fn(async (message: { type: string }) => successfulReply(message));
    vi.stubGlobal("chrome", { runtime: { sendMessage } });
    await import("./content.js");
    await settle();
    expect(sendMessage).not.toHaveBeenCalled();
    expect(document.querySelector("#vinted-assistant-bridge")).toBeNull();
  });

  it.each(changedTargets)("does not mount a delayed listing after changing %s", async (_name, url) => {
    const pending = deferred();
    vi.stubGlobal("chrome", { runtime: { sendMessage: vi.fn(() => pending.promise) } });
    await import("./content.js");
    window.history.replaceState(null, "", url);
    pending.resolve({ ok: true, data: listing });
    await settle();
    expect(document.querySelector("#vinted-assistant-bridge")).toBeNull();
  });

  it("does not mount a stale error panel when a delayed listing fails after path drift", async () => {
    const pending = deferred();
    vi.stubGlobal("chrome", { runtime: { sendMessage: vi.fn(() => pending.promise) } });
    await import("./content.js");
    window.history.replaceState(null, "", `/items/123#vinted-assistant=${listingId}`);
    pending.reject(new Error("listing unavailable"));
    await settle();
    expect(document.querySelector("#vinted-assistant-bridge")).toBeNull();
  });

  it("does not resurrect a pending listing after a detected hash change is reversed", async () => {
    const pending = deferred();
    vi.stubGlobal("chrome", { runtime: { sendMessage: vi.fn(() => pending.promise) } });
    await import("./content.js");
    window.history.replaceState(null, "", changedTargets[0][1]);
    window.dispatchEvent(new HashChangeEvent("hashchange"));
    window.history.replaceState(null, "", selectedUrl);
    pending.resolve(listing);
    await settle();
    expect(document.querySelector("#vinted-assistant-bridge")).toBeNull();
  });

  it.each(changedTargets)("does not attach a delayed photo after changing %s", async (_name, url) => {
    const pending = deferred();
    const sendMessage = vi.fn((message: { type: string }) => message.type === "get-photo"
      ? pending.promise : Promise.resolve({ ok: true, data: successfulReply(message) }));
    vi.stubGlobal("chrome", { runtime: { sendMessage } });
    const photos = document.querySelector<HTMLInputElement>("#photos")!;
    const photoChange = vi.fn();
    photos.addEventListener("change", photoChange);
    await import("./content.js");
    const panel = await mountedPanel();
    const button = getByRole(panel, "button", { name: "Compila campi e foto" });
    fireEvent.click(button);
    expect(sendMessage).toHaveBeenCalledWith({ type: "get-photo", listingId, path: listing.photo_urls[0] });
    window.history.replaceState(null, "", url);
    document.querySelector<HTMLInputElement>("#title")!.value = "Altro annuncio";
    const values = fieldValues();
    sendMessage.mockClear();
    pending.resolve({ ok: true, data: photoPayload });
    await settle();
    expect(fieldValues()).toEqual(values);
    expect(photos.files).toHaveLength(0);
    expect(photoChange).not.toHaveBeenCalled();
    expect(sendMessage).not.toHaveBeenCalled();
    expect(panel.isConnected).toBe(false);
    expect(button).toBeDisabled();
  });

  it("invalidates SPA path drift without navigation events and stops watching", async () => {
    const sendMessage = vi.fn(async (message: { type: string }) => successfulReply(message));
    vi.stubGlobal("chrome", { runtime: { sendMessage } });
    vi.useFakeTimers();
    await import("./content.js");
    await vi.advanceTimersByTimeAsync(0);
    const panel = document.querySelector<HTMLElement>("#vinted-assistant-bridge")!;
    expect(panel).not.toBeNull();
    const button = getByRole(panel, "button", { name: "Compila campi e foto" });
    sendMessage.mockClear();
    window.history.replaceState(null, "", changedTargets[1][1]);
    await vi.advanceTimersByTimeAsync(500);
    expect(panel.isConnected).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
    window.history.replaceState(null, "", selectedUrl);
    fireEvent.click(button);
    expect(sendMessage).not.toHaveBeenCalled();
    expect(document.querySelector<HTMLInputElement>("#title")!.value).toBe("");
  });

  it("closing invalidates pending photos and cleans up the route watcher", async () => {
    const pending = deferred();
    vi.stubGlobal("chrome", { runtime: { sendMessage: vi.fn((message: { type: string }) =>
      message.type === "get-photo" ? pending.promise : Promise.resolve(listing)) } });
    vi.useFakeTimers();
    await import("./content.js");
    await vi.advanceTimersByTimeAsync(0);
    const panel = document.querySelector<HTMLElement>("#vinted-assistant-bridge")!;
    expect(panel).not.toBeNull();
    const button = getByRole(panel, "button", { name: "Compila campi e foto" });
    fireEvent.click(button);
    fireEvent.click(getByRole(panel, "button", { name: "Chiudi Vinted Assistant" }));
    expect(vi.getTimerCount()).toBe(0);
    pending.resolve(photoPayload);
    await vi.advanceTimersByTimeAsync(0);
    expect(document.querySelector<HTMLInputElement>("#photos")!.files).toHaveLength(0);
    expect(panel.isConnected).toBe(false);
    expect(button).toBeDisabled();
  });
});

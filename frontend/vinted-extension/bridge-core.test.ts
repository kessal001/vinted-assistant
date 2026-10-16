import { beforeEach, describe, expect, it, vi } from "vitest";

import "./bridge-core.js";

type BridgeApi = {
  listingIdFromHash(hash: string): string | null;
  fillKnownFields(
    root: Document,
    listing: Record<string, unknown>,
  ): { filled: string[]; missing: string[] };
  filesFromPayloads(
    payloads: Array<{ filename: string; content_type: string; base64: string }>,
  ): File[];
  assignPhotoFiles(
    root: Document,
    files: File[],
    dataTransferFactory?: () => unknown,
  ): boolean;
};

const bridge = (globalThis as typeof globalThis & {
  VintedAssistantBridge: BridgeApi;
}).VintedAssistantBridge;

describe("Vinted Assistant Bridge", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    // jsdom has no DataTransfer constructor. Real cross-world file assignment is
    // verified separately by scripts/bridge-native-smoke.mjs in headless Chrome.
    vi.spyOn(HTMLInputElement.prototype, "files", "set").mockImplementation(function (
      this: HTMLInputElement, value: FileList | null,
    ) {
      Object.defineProperty(this, "files", { configurable: true, value });
    });
  });

  it("reads only the explicit Vinted Assistant listing id from the URL hash", () => {
    expect(
      bridge.listingIdFromHash(
        "#vinted-assistant=9f42a8b2-17d6-4725-943f-7d45e93bed8b",
      ),
    ).toBe("9f42a8b2-17d6-4725-943f-7d45e93bed8b");
    expect(bridge.listingIdFromHash("#other=value")).toBeNull();
    expect(bridge.listingIdFromHash("#vinted-assistant=")).toBeNull();
  });

  it("fills known form fields without activating the publish button", () => {
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
      <button id="publish">Pubblica</button>
    `;
    const publish = document.querySelector<HTMLButtonElement>("#publish")!;
    const publishClick = vi.fn();
    publish.addEventListener("click", publishClick);

    const result = bridge.fillKnownFields(document, {
      title: "Titolo pronto",
      description: "Descrizione pronta",
      category: "Donna > Abbigliamento",
      brand: "Uniqlo",
      size: "M",
      condition: "Ottime condizioni",
      price: 12.5,
      parcel_size: "Piccolo",
    });

    expect(screenValue("#title")).toBe("Titolo pronto");
    expect(screenValue("#description")).toBe("Descrizione pronta");
    expect(screenValue("#category")).toBe("Donna > Abbigliamento");
    expect(screenValue("#brand")).toBe("Uniqlo");
    expect(screenValue("#size")).toBe("M");
    expect(screenValue("#condition")).toBe("Ottime condizioni");
    expect(screenValue("#price")).toBe("12.5");
    expect(screenValue("#parcel")).toBe("Piccolo");
    expect(result.filled).toEqual([
      "title",
      "description",
      "category",
      "brand",
      "size",
      "condition",
      "price",
      "parcel_size",
    ]);
    expect(result.missing).toEqual([]);
    expect(publishClick).not.toHaveBeenCalled();
  });

  it("does not pretend to fill a readonly picker or disabled control", () => {
    document.body.innerHTML = `
      <label for="category">Categoria</label><input id="category" readonly value="" />
      <label for="price">Prezzo</label><input id="price" disabled value="" />
    `;
    const result = bridge.fillKnownFields(document, {
      category: "Bellezza > Profumi > Profumi da uomo",
      price: 85,
    });
    expect(screenValue("#category")).toBe("");
    expect(screenValue("#price")).toBe("");
    expect(result.filled).toEqual([]);
    expect(result.missing).toEqual(["category", "price"]);
  });

  it("creates real photo files and assigns them to the upload input", async () => {
    document.body.innerHTML = '<input id="photos" type="file" multiple />';
    const input = document.querySelector<HTMLInputElement>("#photos")!;
    const change = vi.fn();
    input.addEventListener("change", change);
    const files = bridge.filesFromPayloads([
      {
        filename: "fronte.jpg",
        content_type: "image/jpeg",
        base64: "Zm90bw==",
      },
    ]);
    const added: File[] = [];
    const fakeFileList = {
      get length() {
        return added.length;
      },
      item(index: number) {
        return added[index] ?? null;
      },
      [Symbol.iterator]() {
        return added[Symbol.iterator]();
      },
    };

    const assigned = bridge.assignPhotoFiles(document, files, () => ({
      items: { add: (file: File) => added.push(file) },
      files: fakeFileList,
    }));

    expect(assigned).toBe(true);
    expect(files).toHaveLength(1);
    expect(files[0].name).toBe("fronte.jpg");
    expect(files[0].type).toBe("image/jpeg");
    expect(await files[0].text()).toBe("foto");
    expect(input.files).toHaveLength(1);
    expect(input.files?.item(0)?.name).toBe("fronte.jpg");
    expect(change).toHaveBeenCalledTimes(1);
  });

  it("does not report photos transferred through a disabled upload control", () => {
    document.body.innerHTML = '<input id="photos" type="file" disabled multiple />';
    const input = document.querySelector<HTMLInputElement>("#photos")!;
    const change = vi.fn();
    input.addEventListener("change", change);
    const transferFactory = vi.fn(() => ({ items: { add: vi.fn() }, files: { length: 1 } }));
    expect(bridge.assignPhotoFiles(document, [new File(["test"], "fixture.jpg")], transferFactory)).toBe(false);
    expect(transferFactory).not.toHaveBeenCalled();
    expect(change).not.toHaveBeenCalled();
  });
});

function screenValue(selector: string) {
  return (
    document.querySelector<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(
      selector,
    )?.value ?? ""
  );
}

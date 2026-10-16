import { describe, expect, it, vi } from "vitest";

import "./background-core.js";

type BackgroundApi = {
  createBridgeApi(fetchImpl: typeof fetch, apiBase?: string, runtimeId?: string): {
    handleMessage(message: Record<string, unknown>, sender?: unknown): Promise<unknown>;
  };
};

const background = (globalThis as typeof globalThis & {
  VintedAssistantBackground: BackgroundApi;
}).VintedAssistantBackground;

const RUNTIME_ID = "vinted-assistant-extension";
const LISTING_ID = "9f42a8b2-17d6-4725-943f-7d45e93bed8b";
const PHOTO_PATH = "/uploads/0123456789abcdef0123456789abcdef.jpg";

function senderFor(listingId = LISTING_ID) {
  return {
    id: RUNTIME_ID,
    frameId: 0,
    url: `https://www.vinted.it/items/new#vinted-assistant=${listingId}`,
  };
}

function createApi(fetchImpl: typeof fetch) {
  return background.createBridgeApi(fetchImpl, undefined, RUNTIME_ID);
}

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const OPERATIONS = [
  { type: "get-listing", listingId: LISTING_ID },
  { type: "get-photo", listingId: LISTING_ID, path: PHOTO_PATH },
  { type: "mark-draft", listingId: LISTING_ID, confirmedSaved: true },
];

describe("Vinted Assistant background bridge", () => {
  it("rejects malformed listing ids and non-upload photo paths before fetching", async () => {
    const fetchMock = vi.fn<typeof fetch>();
    const api = createApi(fetchMock);

    await expect(
      api.handleMessage({ type: "get-listing", listingId: "../../secrets" }, senderFor()),
    ).rejects.toThrow("Identificativo annuncio non valido");
    await expect(
      api.handleMessage({ type: "get-photo", listingId: LISTING_ID, path: "/api/listings" }, senderFor()),
    ).rejects.toThrow("Percorso fotografia non valido");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("loads a listing only from the loopback API", async () => {
    const listing = { id: LISTING_ID, title: "Titolo pronto" };
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(jsonResponse(listing));
    const api = createApi(fetchMock);

    await expect(
      api.handleMessage({ type: "get-listing", listingId: LISTING_ID }, senderFor()),
    ).resolves.toEqual(listing);
    expect(fetchMock).toHaveBeenCalledWith(
      `http://127.0.0.1:8000/api/listings/${LISTING_ID}`,
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("returns an approved stored photo as a base64 payload", async () => {
    const bytes = new TextEncoder().encode("foto");
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ id: LISTING_ID, photo_urls: [PHOTO_PATH] }))
      .mockResolvedValueOnce(new Response(bytes, { headers: { "Content-Type": "image/jpeg" } }));
    const api = createApi(fetchMock);

    await expect(
      api.handleMessage({ type: "get-photo", listingId: LISTING_ID, path: PHOTO_PATH }, senderFor()),
    ).resolves.toEqual({
      filename: "0123456789abcdef0123456789abcdef.jpg",
      content_type: "image/jpeg",
      base64: "Zm90bw==",
    });
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      `http://127.0.0.1:8000/api/listings/${LISTING_ID}`,
      expect.objectContaining({ method: "GET" }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      `http://127.0.0.1:8000${PHOTO_PATH}`,
      expect.objectContaining({ method: "GET" }),
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it.each([undefined, "1"])("rejects image bytes over 10 MB even with Content-Length %s", async (contentLength) => {
    const headers: Record<string, string> = { "Content-Type": "image/jpeg" };
    if (contentLength) headers["Content-Length"] = contentLength;
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ id: LISTING_ID, photo_urls: [PHOTO_PATH] }))
      .mockResolvedValueOnce(new Response(new Uint8Array(10 * 1024 * 1024 + 1), { headers }));

    const outcome = await createApi(fetchMock)
      .handleMessage({ type: "get-photo", listingId: LISTING_ID, path: PHOTO_PATH }, senderFor())
      .then(() => "accepted", (error: Error) => error.message);

    expect(outcome).toBe("Fotografia oltre il limite di 10 MB");
  });

  it("accepts an image exactly at the 10 MB response-byte boundary", async () => {
    const bytes = new Uint8Array(10 * 1024 * 1024);
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ id: LISTING_ID, photo_urls: [PHOTO_PATH] }))
      .mockResolvedValueOnce(new Response(bytes, { headers: { "Content-Type": "image/jpeg" } }));

    const payload = await createApi(fetchMock).handleMessage(
      { type: "get-photo", listingId: LISTING_ID, path: PHOTO_PATH }, senderFor(),
    ) as { base64: string };

    expect(atob(payload.base64)).toHaveLength(bytes.length);
  });

  it("rejects an advertised image over 10 MB before reading its body", async () => {
    const response = new Response(Uint8Array.of(1), {
      headers: { "Content-Type": "image/jpeg", "Content-Length": String(10 * 1024 * 1024 + 1) },
    });
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ id: LISTING_ID, photo_urls: [PHOTO_PATH] }))
      .mockResolvedValueOnce(response);
    const outcome = await createApi(fetchMock)
      .handleMessage({ type: "get-photo", listingId: LISTING_ID, path: PHOTO_PATH }, senderFor())
      .then(() => "accepted", (error: Error) => error.message);

    expect(outcome).toBe("Fotografia oltre il limite di 10 MB");
  });

  it("cancels an over-limit image stream without waiting for its end", async () => {
    vi.useFakeTimers();
    try {
      const cancel = vi.fn();
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new Uint8Array(10 * 1024 * 1024));
          controller.enqueue(Uint8Array.of(1));
        },
        cancel,
      });
      const fetchMock = vi.fn<typeof fetch>()
        .mockResolvedValueOnce(jsonResponse({ id: LISTING_ID, photo_urls: [PHOTO_PATH] }))
        .mockResolvedValueOnce(new Response(stream, { headers: { "Content-Type": "image/jpeg" } }));
      const outcome = createApi(fetchMock)
        .handleMessage({ type: "get-photo", listingId: LISTING_ID, path: PHOTO_PATH }, senderFor())
        .then(() => "accepted", (error: Error) => error.message);
      await vi.advanceTimersByTimeAsync(0);

      expect(cancel).toHaveBeenCalledTimes(1);
      expect(await outcome).toBe("Fotografia oltre il limite di 10 MB");
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it.each([undefined, "text/html", "image/gif", "image/svg+xml", "application/octet-stream", "image/jpeg, text/html"])(
    "refuses unsupported or missing image Content-Type %s",
    async (contentType) => {
      const headers = contentType ? { "Content-Type": contentType } : undefined;
      const fetchMock = vi.fn<typeof fetch>()
        .mockResolvedValueOnce(jsonResponse({ id: LISTING_ID, photo_urls: [PHOTO_PATH] }))
        .mockResolvedValueOnce(new Response(Uint8Array.of(1), { headers }));

      await expect(
        createApi(fetchMock).handleMessage({ type: "get-photo", listingId: LISTING_ID, path: PHOTO_PATH }, senderFor()),
      ).rejects.toThrow("Tipo fotografia non supportato");
    },
  );

  it.each([
    ["jpg", "image/jpeg", "image/jpeg"],
    ["png", "image/png", "image/png"],
    ["webp", "image/webp", "image/webp"],
    ["jpg", "IMAGE/JPEG", "image/jpeg"],
    ["png", "image/png; charset=binary", "image/png"],
  ])("accepts an authorized %s photo with Content-Type %s", async (extension, header, content_type) => {
    const path = PHOTO_PATH.replace(".jpg", `.${extension}`);
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ id: LISTING_ID, photo_urls: [path] }))
      .mockResolvedValueOnce(new Response("foto", { headers: { "Content-Type": header } }));

    await expect(
      createApi(fetchMock).handleMessage({ type: "get-photo", listingId: LISTING_ID, path }, senderFor()),
    ).resolves.toEqual({ filename: path.split("/").pop(), content_type, base64: "Zm90bw==" });
  });

  it("rejects every photo path outside the exact stored-image format before fetching", async () => {
    const fetchMock = vi.fn<typeof fetch>();
    const api = createApi(fetchMock);

    for (const path of [
      undefined,
      null,
      [PHOTO_PATH],
      "/api/listings",
      "/uploads/../../secrets.jpg",
      "https://evil.test" + PHOTO_PATH,
      PHOTO_PATH + "?download=1",
      PHOTO_PATH + "#fragment",
      PHOTO_PATH + "\n",
      PHOTO_PATH + "\r\n",
      PHOTO_PATH.replace(".jpg", ".jpeg"),
      PHOTO_PATH.replace(".jpg", ".svg"),
      PHOTO_PATH.replace("0123456789abcdef", "not-a-hash"),
    ]) {
      await expect(
        api.handleMessage({ type: "get-photo", listingId: LISTING_ID, path }, senderFor()),
      ).rejects.toThrow("Percorso fotografia non valido");
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refuses photos absent from the selected listing without fetching the photo", async () => {
    for (const photo_urls of [
      undefined,
      null,
      PHOTO_PATH,
      [],
      ["/uploads/11111111111111111111111111111111.jpg"],
      Array.from({ length: 11 }, () => PHOTO_PATH),
    ]) {
      const fetchMock = vi.fn<typeof fetch>()
        .mockResolvedValueOnce(jsonResponse({ id: LISTING_ID, photo_urls }));
      const api = createApi(fetchMock);

      await expect(
        api.handleMessage({ type: "get-photo", listingId: LISTING_ID, path: PHOTO_PATH }, senderFor()),
      ).rejects.toThrow("Fotografia non appartenente all'annuncio selezionato");
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(fetchMock).toHaveBeenCalledWith(
        `http://127.0.0.1:8000/api/listings/${LISTING_ID}`,
        expect.objectContaining({ method: "GET" }),
      );
    }
  });

  it.each(["get-listing", "get-photo"])("refuses another record returned for %s", async (type) => {
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({
        id: "9f42a8b2-17d6-4725-943f-7d45e93bed8c",
        photo_urls: [PHOTO_PATH],
      }));
    const api = createApi(fetchMock);

    await expect(
      api.handleMessage({ type, listingId: LISTING_ID, path: PHOTO_PATH }, senderFor()),
    ).rejects.toThrow("Annuncio restituito non corrispondente");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("requires explicit human saved-draft confirmation before writing", async () => {
    const fetchMock = vi.fn<typeof fetch>();
    const api = createApi(fetchMock);

    for (const confirmedSaved of [undefined, null, false, "true", 1, {}]) {
      await expect(
        api.handleMessage({ type: "mark-draft", listingId: LISTING_ID, confirmedSaved }, senderFor()),
      ).rejects.toThrow("Conferma del salvataggio della bozza richiesta");
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns the persisted GET read-back after marking only the selected draft", async () => {
    const updated = { id: LISTING_ID, status: "vinted_draft", title: "Persistito" };
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ id: LISTING_ID, status: "vinted_draft", title: "PATCH echo" }))
      .mockResolvedValueOnce(jsonResponse(updated));
    const api = createApi(fetchMock);

    await expect(
      api.handleMessage({ type: "mark-draft", listingId: LISTING_ID, confirmedSaved: true }, senderFor()),
    ).resolves.toEqual(updated);
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      `http://127.0.0.1:8000/api/listings/${LISTING_ID}`,
      expect.objectContaining({
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "vinted_draft" }),
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      `http://127.0.0.1:8000/api/listings/${LISTING_ID}`,
      expect.objectContaining({ method: "GET", cache: "no-store" }),
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("refuses a read-back for another listing after a successful PATCH", async () => {
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ id: LISTING_ID, status: "vinted_draft" }))
      .mockResolvedValueOnce(jsonResponse({ id: "9f42a8b2-17d6-4725-943f-7d45e93bed8c", status: "vinted_draft" }));

    await expect(
      createApi(fetchMock).handleMessage({ type: "mark-draft", listingId: LISTING_ID, confirmedSaved: true }, senderFor()),
    ).rejects.toThrow("Annuncio restituito non corrispondente");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("refuses blind success when the GET read-back did not persist vinted_draft", async () => {
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ id: LISTING_ID, status: "vinted_draft" }))
      .mockResolvedValueOnce(jsonResponse({ id: LISTING_ID, status: "ready" }));

    await expect(
      createApi(fetchMock).handleMessage({ type: "mark-draft", listingId: LISTING_ID, confirmedSaved: true }, senderFor()),
    ).rejects.toThrow("Stato bozza non confermato dalla rilettura");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it.each([
    ["listing", "Impossibile caricare l'annuncio", 1],
    ["photo authorization", "Impossibile caricare l'annuncio", 1],
    ["photo", "Impossibile caricare la fotografia", 2],
    ["draft PATCH", "Impossibile aggiornare lo stato", 1],
    ["draft read-back", "Impossibile caricare l'annuncio", 2],
  ] as const)("propagates HTTP status and backend detail for %s", async (stage, label, calls) => {
    const fetchMock = vi.fn<typeof fetch>();
    if (stage === "photo") {
      fetchMock.mockResolvedValueOnce(jsonResponse({ id: LISTING_ID, photo_urls: [PHOTO_PATH] }));
    } else if (stage === "draft read-back") {
      fetchMock.mockResolvedValueOnce(jsonResponse({ id: LISTING_ID, status: "vinted_draft" }));
    }
    fetchMock.mockResolvedValueOnce(jsonResponse({ detail: "Risorsa non trovata" }, 404));
    const message = {
      type: stage.startsWith("photo") ? "get-photo" : stage.startsWith("draft") ? "mark-draft" : "get-listing",
      listingId: LISTING_ID,
      path: PHOTO_PATH,
      confirmedSaved: true,
    };

    await expect(createApi(fetchMock).handleMessage(message, senderFor()))
      .rejects.toThrow(`${label} (404): Risorsa non trovata`);
    expect(fetchMock).toHaveBeenCalledTimes(calls);
  });

  it.each(OPERATIONS)("identifies the fixed local API when $type fetch fails", async (message) => {
    const fetchMock = vi.fn<typeof fetch>().mockRejectedValue(new TypeError("Failed to fetch"));

    await expect(createApi(fetchMock).handleMessage(message, senderFor()))
      .rejects.toThrow("API locale non raggiungibile (http://127.0.0.1:8000): Failed to fetch");
  });

  it("reports a malformed listing JSON response instead of a blind result", async () => {
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response("not JSON", { headers: { "Content-Type": "application/json" } }));

    await expect(createApi(fetchMock).handleMessage({ type: "get-listing", listingId: LISTING_ID }, senderFor()))
      .rejects.toThrow("Risposta annuncio non valida");
  });

  it.each(OPERATIONS)("aborts a stalled $type request at the finite deadline", async (message) => {
    vi.useFakeTimers();
    try {
      const fetchMock = vi.fn<typeof fetch>().mockImplementation(() => new Promise<Response>(() => {}));
      const result = createApi(fetchMock).handleMessage(message, senderFor());
      const failure = result.catch((error: unknown) => error);

      await vi.advanceTimersByTimeAsync(15_000);

      expect(fetchMock.mock.calls[0][1]?.signal?.aborted).toBe(true);
      expect(await failure).toMatchObject({ message: "Tempo limite API locale superato" });
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it.each(["listing", "photo", "draft read-back"])("keeps the deadline active while reading a stalled %s body", async (stage) => {
    vi.useFakeTimers();
    try {
      const stalled = new Response(new ReadableStream<Uint8Array>(), {
        headers: { "Content-Type": stage === "photo" ? "image/jpeg" : "application/json" },
      });
      const fetchMock = vi.fn<typeof fetch>();
      if (stage === "photo") {
        fetchMock.mockResolvedValueOnce(jsonResponse({ id: LISTING_ID, photo_urls: [PHOTO_PATH] }));
      } else if (stage === "draft read-back") {
        fetchMock.mockResolvedValueOnce(jsonResponse({ id: LISTING_ID, status: "vinted_draft" }));
      }
      fetchMock.mockResolvedValueOnce(stalled);
      const message = {
        type: stage === "photo" ? "get-photo" : stage === "listing" ? "get-listing" : "mark-draft",
        listingId: LISTING_ID,
        path: PHOTO_PATH,
        confirmedSaved: true,
      };
      const result = createApi(fetchMock).handleMessage(message, senderFor());
      const failure = result.catch((error: unknown) => error);
      await vi.advanceTimersByTimeAsync(0);
      const lastCall = fetchMock.mock.calls.at(-1)!;

      await vi.advanceTimersByTimeAsync(15_000);

      expect(lastCall[1]?.signal?.aborted).toBe(true);
      expect(await failure).toMatchObject({ message: "Tempo limite API locale superato" });
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it.each(OPERATIONS)("uses credential-free redirect-blocked local fetches for $type", async (message) => {
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(async (url) => {
      if (String(url).endsWith(PHOTO_PATH)) {
        return new Response("foto", { headers: { "Content-Type": "image/jpeg" } });
      }
      return jsonResponse({ id: LISTING_ID, status: "vinted_draft", photo_urls: [PHOTO_PATH] });
    });

    await createApi(fetchMock).handleMessage(message, senderFor());

    expect(fetchMock).toHaveBeenCalled();
    for (const [url, options] of fetchMock.mock.calls) {
      expect(String(url).startsWith("http://127.0.0.1:8000/")).toBe(true);
      expect(options).toEqual(expect.objectContaining({
        credentials: "omit",
        redirect: "error",
        cache: "no-store",
      }));
    }
  });

  it("rejects every configurable API base except the fixed loopback origin", () => {
    const fetchMock = vi.fn<typeof fetch>();
    for (const apiBase of [
      "https://www.vinted.it",
      "http://localhost:8000",
      "http://127.0.0.1:8001",
      "https://127.0.0.1:8000",
      "http://127.0.0.1:8000/",
      "http://127.0.0.1:8000@evil.test",
      "http://127.0.0.1:8000/api/listings",
    ]) {
      expect(() => background.createBridgeApi(fetchMock, apiBase, RUNTIME_ID))
        .toThrow("API consentita solo su http://127.0.0.1:8000");
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each(OPERATIONS)("rejects trailing UUID newlines for $type even in a matching encoded hash", async (message) => {
    const fetchMock = vi.fn<typeof fetch>();
    const api = createApi(fetchMock);

    for (const ending of ["\n", "\r", "\r\n"]) {
      const listingId = LISTING_ID + ending;
      await expect(
        api.handleMessage({ ...message, listingId }, senderFor(encodeURIComponent(listingId))),
      ).rejects.toThrow("Identificativo annuncio non valido");
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each(OPERATIONS)("requires a literal UUID listingId for $type before fetching", async (message) => {
    const fetchMock = vi.fn<typeof fetch>();
    const api = createApi(fetchMock);

    for (const listingId of [undefined, null, true, {}, [LISTING_ID], "invalid", "../../secrets"]) {
      await expect(
        api.handleMessage({ ...message, listingId }, senderFor()),
      ).rejects.toThrow("Identificativo annuncio non valido");
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each(OPERATIONS)("rejects $type when the selected hash does not match before fetching", async (message) => {
    const fetchMock = vi.fn<typeof fetch>();
    const api = createApi(fetchMock);

    for (const hash of [
      "",
      "#vinted-assistant=invalid",
      "#vinted-assistant=9f42a8b2-17d6-4725-943f-7d45e93bed8c",
      `#other=${LISTING_ID}`,
      `#vinted-assistant=${LISTING_ID}&vinted-assistant=${LISTING_ID}`,
    ]) {
      await expect(
        api.handleMessage(message, { ...senderFor(), url: `https://www.vinted.it/items/new${hash}` }),
      ).rejects.toThrow("Annuncio selezionato non corrispondente");
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each(OPERATIONS)("rejects $type outside the official new-item page before fetching", async (message) => {
    const fetchMock = vi.fn<typeof fetch>();
    const api = createApi(fetchMock);
    const hash = `#vinted-assistant=${LISTING_ID}`;

    for (const page of [
      "http://www.vinted.it/items/new",
      "https://vinted.it/items/new",
      "https://www.vinted.fr/items/new",
      "https://www.vinted.it.evil.test/items/new",
      "https://www.vinted.it:8443/items/new",
      "https://user:secret@www.vinted.it/items/new",
      "https://www.vinted.it/items/new/",
      "https://www.vinted.it/items/123",
      "https://www.vinted.it/items/new/anything",
      "chrome-extension://vinted-assistant-extension/items/new",
      "not-a-url",
      "",
    ]) {
      await expect(
        api.handleMessage(message, { ...senderFor(), url: page + hash }),
      ).rejects.toThrow("Pagina Vinted non autorizzata");
    }
    await expect(
      api.handleMessage(message, { ...senderFor(), url: undefined }),
    ).rejects.toThrow("Pagina Vinted non autorizzata");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each(OPERATIONS)("rejects $type outside the top frame before fetching", async (message) => {
    const fetchMock = vi.fn<typeof fetch>();
    const api = createApi(fetchMock);

    for (const frameId of [undefined, 1, -1, "0"]) {
      await expect(
        api.handleMessage(message, { ...senderFor(), frameId }),
      ).rejects.toThrow("Mittente bridge non autorizzato");
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each(OPERATIONS)("rejects $type from another extension before fetching", async (message) => {
    const fetchMock = vi.fn<typeof fetch>();
    const api = createApi(fetchMock);

    await expect(
      api.handleMessage(message, { ...senderFor(), id: "another-extension" }),
    ).rejects.toThrow("Mittente bridge non autorizzato");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

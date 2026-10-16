(() => {
  "use strict";

  const API_BASE = "http://127.0.0.1:8000";
  const REQUEST_TIMEOUT_MS = 15_000;
  const MAX_PHOTO_BYTES = 10 * 1024 * 1024;
  const UUID_PATTERN =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const PHOTO_PATH_PATTERN = /^\/uploads\/[0-9a-f]{32}\.(?:jpg|png|webp)$/i;

  function bufferToBase64(buffer) {
    const bytes = new Uint8Array(buffer);
    let binary = "";
    const chunkSize = 0x8000;
    for (let offset = 0; offset < bytes.length; offset += chunkSize) {
      binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
    }
    return btoa(binary);
  }

  function createBridgeApi(fetchImpl, apiBase = API_BASE, runtimeId) {
    if (apiBase !== API_BASE) {
      throw new Error(`API consentita solo su ${API_BASE}`);
    }
    async function request(path, options, failureMessage, consume) {
      const controller = new AbortController();
      let timer;
      const deadline = new Promise((_, reject) => {
        timer = setTimeout(() => {
          reject(new Error("Tempo limite API locale superato"));
          controller.abort();
        }, REQUEST_TIMEOUT_MS);
      });
      try {
        return await Promise.race([
          (async () => {
            let response;
            try {
              response = await fetchImpl(`${API_BASE}${path}`, {
                ...options,
                cache: "no-store",
                credentials: "omit",
                redirect: "error",
                signal: controller.signal,
              });
            } catch (error) {
              const detail = error instanceof Error ? error.message : String(error);
              throw new Error(`API locale non raggiungibile (${API_BASE}): ${detail}`);
            }
            if (!response.ok) {
              let detail = "";
              try {
                const payload = await response.json();
                if (typeof payload?.detail === "string") detail = payload.detail;
              } catch {
                // HTTP status remains useful even when the error body is not JSON.
              }
              throw new Error(`${failureMessage} (${response.status})${detail ? `: ${detail}` : ""}`);
            }
            return consume(response);
          })(),
          deadline,
        ]);
      } catch (error) {
        controller.abort();
        throw error;
      } finally {
        clearTimeout(timer);
      }
    }

    async function readPhotoBuffer(response) {
      if (Number(response.headers.get("content-length")) > MAX_PHOTO_BYTES) {
        throw new Error("Fotografia oltre il limite di 10 MB");
      }
      if (!response.body) return new ArrayBuffer(0);
      const reader = response.body.getReader();
      const chunks = [];
      let total = 0;
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          total += value.byteLength;
          if (total > MAX_PHOTO_BYTES) {
            void reader.cancel().catch(() => {});
            throw new Error("Fotografia oltre il limite di 10 MB");
          }
          chunks.push(value);
        }
      } finally {
        reader.releaseLock();
      }
      const bytes = new Uint8Array(total);
      let offset = 0;
      for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.byteLength;
      }
      return bytes.buffer;
    }

    async function loadListing(listingId) {
      return request(
        `/api/listings/${listingId}`,
        { method: "GET" },
        "Impossibile caricare l'annuncio",
        async (response) => {
          let listing;
          try {
            listing = await response.json();
          } catch (error) {
            const detail = error instanceof Error ? error.message : String(error);
            throw new Error(`Risposta annuncio non valida: ${detail}`);
          }
          if (listing?.id !== listingId) {
            throw new Error("Annuncio restituito non corrispondente");
          }
          return listing;
        },
      );
    }

    async function handleMessage(message, sender) {
      if (!runtimeId || sender?.id !== runtimeId || sender.frameId !== 0) {
        throw new Error("Mittente bridge non autorizzato");
      }
      let pageUrl;
      try {
        if (typeof sender.url !== "string") throw new Error();
        pageUrl = new URL(sender.url);
      } catch {
        throw new Error("Pagina Vinted non autorizzata");
      }
      if (
        pageUrl.origin !== "https://www.vinted.it" ||
        pageUrl.pathname !== "/items/new" ||
        pageUrl.username ||
        pageUrl.password
      ) {
        throw new Error("Pagina Vinted non autorizzata");
      }
      const listingId = message?.listingId;
      if (typeof listingId !== "string" || !UUID_PATTERN.test(listingId)) {
        throw new Error("Identificativo annuncio non valido");
      }
      const selectedIds = new URLSearchParams(pageUrl.hash.slice(1)).getAll("vinted-assistant");
      if (
        selectedIds.length !== 1 ||
        !UUID_PATTERN.test(selectedIds[0]) ||
        selectedIds[0] !== listingId
      ) {
        throw new Error("Annuncio selezionato non corrispondente");
      }
      if (message.type === "get-listing") {
        return loadListing(listingId);
      }
      if (message.type === "get-photo") {
        const path = message.path;
        if (typeof path !== "string" || !PHOTO_PATH_PATTERN.test(path)) {
          throw new Error("Percorso fotografia non valido");
        }
        const listing = await loadListing(listingId);
        if (
          !Array.isArray(listing.photo_urls) ||
          listing.photo_urls.length > 10 ||
          !listing.photo_urls.includes(path)
        ) {
          throw new Error("Fotografia non appartenente all'annuncio selezionato");
        }
        return request(path, { method: "GET" }, "Impossibile caricare la fotografia", async (response) => {
          const contentType = (response.headers.get("content-type") || "")
            .split(";", 1)[0].trim().toLowerCase();
          if (!/^image\/(?:jpeg|png|webp)$/.test(contentType)) {
            throw new Error("Tipo fotografia non supportato");
          }
          return {
            filename: path.split("/").pop(),
            content_type: contentType,
            base64: bufferToBase64(await readPhotoBuffer(response)),
          };
        });
      }
      if (message.type === "mark-draft") {
        if (message.confirmedSaved !== true) {
          throw new Error("Conferma del salvataggio della bozza richiesta");
        }
        await request(
          `/api/listings/${listingId}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status: "vinted_draft" }),
          },
          "Impossibile aggiornare lo stato",
          () => undefined,
        );
        const listing = await loadListing(listingId);
        if (listing.status !== "vinted_draft") {
          throw new Error("Stato bozza non confermato dalla rilettura");
        }
        return listing;
      }
      throw new Error("Richiesta bridge non supportata");
    }

    return { apiBase, fetchImpl, handleMessage };
  }

  globalThis.VintedAssistantBackground = {
    createBridgeApi,
  };
})();

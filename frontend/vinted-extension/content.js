(() => {
  "use strict";

  const bridge = globalThis.VintedAssistantBridge;
  const listingId = bridge?.listingIdFromHash(globalThis.location.hash);
  if (!bridge || !listingId || document.querySelector("#vinted-assistant-bridge")) {
    return;
  }

  let active = true;
  let mountedPanel = null;
  let routeTimer;

  function invalidate() {
    if (!active) return;
    active = false;
    globalThis.clearInterval(routeTimer);
    globalThis.removeEventListener("hashchange", ensureTarget);
    globalThis.removeEventListener("popstate", ensureTarget);
    globalThis.removeEventListener("pagehide", invalidate);
    for (const control of mountedPanel?.querySelectorAll("button, input") || []) {
      control.disabled = true;
    }
    mountedPanel?.remove();
  }

  function ensureTarget() {
    if (!active) return false;
    const pageUrl = new URL(globalThis.location.href);
    const selectedIds = new URLSearchParams(pageUrl.hash.slice(1)).getAll("vinted-assistant");
    if (
      pageUrl.origin !== "https://www.vinted.it" ||
      pageUrl.pathname !== "/items/new" ||
      pageUrl.username || pageUrl.password ||
      selectedIds.length !== 1 || selectedIds[0] !== listingId ||
      (mountedPanel && !mountedPanel.isConnected)
    ) {
      invalidate();
      return false;
    }
    return true;
  }

  if (!ensureTarget()) return;
  globalThis.addEventListener("hashchange", ensureTarget);
  globalThis.addEventListener("popstate", ensureTarget);
  globalThis.addEventListener("pagehide", invalidate);
  // SPA history writes do not emit navigation events; never patch page history.
  routeTimer = globalThis.setInterval(ensureTarget, 250);

  const fieldLabels = {
    title: "Titolo", description: "Descrizione", category: "Categoria",
    brand: "Marca", size: "Taglia o formato", condition: "Condizione",
    price: "Prezzo", parcel_size: "Dimensione del pacco", photos: "Fotografie",
  };

  function element(tagName, className, text) {
    const node = document.createElement(tagName);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  }

  async function sendMessage(message) {
    if (!ensureTarget()) throw new Error("Pagina o annuncio selezionato cambiato");
    const response = await chrome.runtime.sendMessage(message);
    if (!ensureTarget()) throw new Error("Pagina o annuncio selezionato cambiato");
    if (response && response.ok === false) {
      throw new Error(response.error || "Richiesta bridge non riuscita");
    }
    return response?.data ?? response;
  }

  function buildPanel(listing) {
    const panel = element("aside", "vinted-assistant-panel");
    panel.id = "vinted-assistant-bridge";
    panel.setAttribute("aria-label", "Vinted Assistant");

    const header = element("div", "vinted-assistant-header");
    const headingGroup = element("div");
    headingGroup.append(
      element("strong", "vinted-assistant-heading", "Vinted Assistant"),
      element("span", "vinted-assistant-kicker", "Bozza locale selezionata"),
    );
    const closeButton = element("button", "vinted-assistant-close", "×");
    closeButton.type = "button";
    closeButton.setAttribute("aria-label", "Chiudi Vinted Assistant");
    closeButton.addEventListener("click", invalidate);
    header.append(headingGroup, closeButton);

    const title = element("p", "vinted-assistant-title", listing.title);
    const status = element(
      "p",
      "vinted-assistant-status",
      "Pronto. Compila i campi, controlla tutto e pubblica solo manualmente.",
    );
    status.setAttribute("role", "status");

    const manual = element("details", "vinted-assistant-manual");
    manual.hidden = true;
    const manualValues = element("dl");
    manual.append(element("summary", "", "Valori da scegliere nel modulo"), manualValues);

    const fillButton = element(
      "button",
      "vinted-assistant-primary",
      "Compila campi e foto",
    );
    fillButton.type = "button";
    let photosSent = false;
    let photoCount = 0;
    fillButton.addEventListener("click", async () => {
      if (!ensureTarget()) return;
      fillButton.disabled = true;
      status.textContent = "Trasferimento in corso…";
      try {
        const result = bridge.fillKnownFields(document, listing);
        if (!ensureTarget()) return;
        let photosAttached = photosSent;
        if (!photosSent) {
          const payloads = [];
          for (const path of listing.photo_urls || []) {
            payloads.push(await sendMessage({ type: "get-photo", listingId, path }));
          }
          const files = bridge.filesFromPayloads(payloads);
          if (!ensureTarget()) return;
          photosAttached = files.length === 0 || bridge.assignPhotoFiles(document, files);
          if (photosAttached) {
            photosSent = true;
            photoCount = files.length;
          }
        }
        if (!ensureTarget()) return;
        const missing = [...result.missing];
        if (!photosAttached && listing.photo_urls?.length > 0) missing.push("photos");
        manualValues.replaceChildren();
        for (const key of missing) {
          const label = fieldLabels[key] || key;
          const value = key === "photos"
            ? "Carica le fotografie reali usando il pulsante del modulo Vinted."
            : key === "price"
              ? new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(listing[key])
              : String(listing[key] ?? "");
          const row = element("dd");
          row.append(element("span", "", value));
          if (key !== "photos") {
            const copy = element("button", "vinted-assistant-copy", "Copia");
            copy.type = "button";
            copy.setAttribute("aria-label", `Copia ${label}`);
            copy.addEventListener("click", async () => {
              if (!ensureTarget()) return;
              try {
                await navigator.clipboard.writeText(String(listing[key] ?? ""));
                if (!ensureTarget()) return;
                copy.textContent = "Copiato";
              } catch {
                if (!ensureTarget()) return;
                status.textContent = `Copia non disponibile. Seleziona e copia il valore di ${label} qui sotto.`;
              }
            });
            row.append(copy);
          }
          manualValues.append(element("dt", "", label), row);
        }
        manual.hidden = missing.length === 0;
        status.textContent = missing.length
          ? `Trasferiti ${result.filled.length} campi e ${photoCount} foto. Completa manualmente: ${missing.map((key) => fieldLabels[key] || key).join(", ")}.`
          : `Trasferiti ${result.filled.length} campi e ${photoCount} foto. Controlla il modulo; Pubblica resta manuale.`;
      } catch (error) {
        if (!ensureTarget()) return;
        status.textContent = `Trasferimento non completato: ${error instanceof Error ? error.message : String(error)}`;
      } finally {
        fillButton.disabled = !ensureTarget();
      }
    });

    const draftButton = element(
      "button",
      "vinted-assistant-secondary",
      "Segna come bozza Vinted",
    );
    draftButton.type = "button";
    draftButton.disabled = true;
    const confirmationLabel = element("label", "vinted-assistant-confirmation");
    const confirmation = element("input");
    confirmation.type = "checkbox";
    confirmation.addEventListener("change", () => {
      if (!ensureTarget()) return;
      draftButton.disabled = !confirmation.checked;
    });
    confirmationLabel.append(
      confirmation,
      element("span", "", "Ho premuto Salva bozza su Vinted e verificato che la bozza esiste."),
    );
    draftButton.addEventListener("click", async () => {
      if (!ensureTarget() || !confirmation.checked) return;
      draftButton.disabled = true;
      try {
        await sendMessage({ type: "mark-draft", listingId, confirmedSaved: true });
        status.textContent = "Stato aggiornato: Bozza Vinted";
      } catch (error) {
        if (!ensureTarget()) return;
        status.textContent = `Stato non aggiornato: ${error instanceof Error ? error.message : String(error)}`;
      } finally {
        draftButton.disabled = !ensureTarget() || !confirmation.checked;
      }
    });

    const safety = element(
      "p",
      "vinted-assistant-safety",
      "Il bridge non preme mai Pubblica e non usa cookie o API private Vinted.",
    );
    panel.append(header, title, status, fillButton, manual, confirmationLabel, draftButton, safety);
    return panel;
  }

  void sendMessage({ type: "get-listing", listingId })
    .then((listing) => {
      if (!ensureTarget()) return;
      mountedPanel = buildPanel(listing);
      document.body.append(mountedPanel);
    })
    .catch((error) => {
      if (!ensureTarget()) return;
      const panel = element("aside", "vinted-assistant-panel");
      panel.id = "vinted-assistant-bridge";
      panel.append(
        element("strong", "vinted-assistant-heading", "Vinted Assistant"),
        element(
          "p",
          "vinted-assistant-status",
          `Bozza non caricata: ${error instanceof Error ? error.message : String(error)}`,
        ),
      );
      mountedPanel = panel;
      document.body.append(panel);
    });
})();

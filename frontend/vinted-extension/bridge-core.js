(() => {
  "use strict";

  const UUID_PATTERN =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  const FIELD_SPECS = [
    { key: "title", labels: ["titolo", "title"] },
    { key: "description", labels: ["descrizione", "description"] },
    { key: "category", labels: ["categoria", "category"] },
    { key: "brand", labels: ["marca", "brand"] },
    { key: "size", labels: ["taglia", "size"] },
    { key: "condition", labels: ["condizione", "condition"] },
    { key: "price", labels: ["prezzo", "price"] },
    {
      key: "parcel_size",
      labels: ["dimensione pacco", "dimensione del pacco", "parcel size"],
    },
  ];

  function normalize(value) {
    return String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/gi, " ")
      .trim()
      .toLowerCase();
  }

  function listingIdFromHash(hash) {
    const parameters = new URLSearchParams(String(hash || "").replace(/^#/, ""));
    const listingId = parameters.get("vinted-assistant");
    return listingId && UUID_PATTERN.test(listingId) ? listingId : null;
  }

  function labelMatches(text, aliases) {
    const normalized = normalize(text);
    return aliases.some((alias) => normalized === normalize(alias));
  }

  function findField(root, aliases) {
    const labels = Array.from(root.querySelectorAll("label"));
    for (const label of labels) {
      if (!labelMatches(label.textContent, aliases)) continue;
      if (label.control) return label.control;
      const targetId = label.getAttribute("for");
      if (targetId) {
        const target = root.getElementById(targetId);
        if (target) return target;
      }
      const nested = label.querySelector("input, textarea, select");
      if (nested) return nested;
    }

    const controls = Array.from(root.querySelectorAll("input, textarea, select"));
    return (
      controls.find((control) => {
        const candidates = [
          control.getAttribute("aria-label"),
          control.getAttribute("placeholder"),
          control.getAttribute("name"),
          control.id,
        ];
        return candidates.some((candidate) => labelMatches(candidate, aliases));
      }) || null
    );
  }

  function setNativeValue(control, value) {
    if (control.disabled || control.readOnly) return false;
    if (control instanceof HTMLSelectElement) {
      const normalizedValue = normalize(value);
      const option = Array.from(control.options).find(
        (candidate) =>
          normalize(candidate.value) === normalizedValue ||
          normalize(candidate.textContent) === normalizedValue,
      );
      if (!option) return false;
      control.value = option.value;
    } else if (
      control instanceof HTMLInputElement ||
      control instanceof HTMLTextAreaElement
    ) {
      const prototype =
        control instanceof HTMLTextAreaElement
          ? HTMLTextAreaElement.prototype
          : HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
      if (setter) setter.call(control, String(value));
      else control.value = String(value);
    } else {
      return false;
    }

    control.dispatchEvent(new Event("input", { bubbles: true }));
    control.dispatchEvent(new Event("change", { bubbles: true }));
    control.dispatchEvent(new Event("blur", { bubbles: true }));
    return true;
  }

  function fillKnownFields(root, listing) {
    const filled = [];
    const missing = [];

    for (const spec of FIELD_SPECS) {
      const value = listing[spec.key];
      if (value === null || value === undefined || value === "") continue;
      const control = findField(root, spec.labels);
      if (!control || !setNativeValue(control, value)) {
        missing.push(spec.key);
        continue;
      }
      filled.push(spec.key);
    }

    return { filled, missing };
  }

  function filesFromPayloads(payloads) {
    return payloads.map((payload, index) => {
      const binary = atob(payload.base64);
      const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
      const fallbackName = `foto-${index + 1}.jpg`;
      const filename =
        String(payload.filename || fallbackName)
          .split(/[\\/]/)
          .pop()
          ?.replace(/[\u0000-\u001f\u007f]/g, "") || fallbackName;
      return new File([bytes], filename, {
        type: payload.content_type || "application/octet-stream",
      });
    });
  }

  function assignPhotoFiles(root, files, dataTransferFactory) {
    const input = root.querySelector('input[type="file"]');
    if (!(input instanceof HTMLInputElement) || input.disabled) return false;
    const transfer = dataTransferFactory
      ? dataTransferFactory()
      : new DataTransfer();
    files.forEach((file) => transfer.items.add(file));
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "files")?.set;
    if (!setter) return false;
    setter.call(input, transfer.files);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  }

  globalThis.VintedAssistantBridge = {
    assignPhotoFiles,
    filesFromPayloads,
    fillKnownFields,
    listingIdFromHash,
  };
})();

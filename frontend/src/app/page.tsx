"use client";

import Image from "next/image";
import {
  type ChangeEvent,
  type FormEvent,
  useCallback,
  useEffect,
  useState,
} from "react";
import styles from "./page.module.css";

type PhotoPreview = {
  file: File;
  url: string;
};

type Listing = {
  id: string;
  photo_urls: string[];
  item_type: string | null;
  brand: string | null;
  size: string | null;
  title: string;
  description: string;
  category: string;
  condition: string;
  price: number;
  parcel_size: string;
  status: string;
  created_at: string;
  updated_at: string;
};

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:8000";
const VINTED_NEW_ITEM_URL = "https://www.vinted.it/items/new";

const STATUS_LABELS: Record<string, string> = {
  ready: "Pronto",
  vinted_draft: "Bozza Vinted",
  published: "Pubblicato",
};

function formatPrice(price: number) {
  return `${price.toFixed(2).replace(".", ",")} €`;
}

async function requestListings(signal?: AbortSignal): Promise<Listing[]> {
  const response = await fetch(`${API_BASE_URL}/api/listings`, { signal });
  if (!response.ok) {
    throw new Error("Impossibile caricare gli annunci");
  }
  return (await response.json()) as Listing[];
}

export default function Home() {
  const [photos, setPhotos] = useState<PhotoPreview[]>([]);
  const [listings, setListings] = useState<Listing[]>([]);
  const [isQueueLoading, setIsQueueLoading] = useState(true);
  const [queueError, setQueueError] = useState<string | null>(null);
  const [selectedListing, setSelectedListing] = useState<Listing | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [intakeSuccess, setIntakeSuccess] = useState<string | null>(null);
  const [intakeError, setIntakeError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isTransferring, setIsTransferring] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [editorMessage, setEditorMessage] = useState<string | null>(null);
  const [editorError, setEditorError] = useState<string | null>(null);

  const loadListings = useCallback(async (signal?: AbortSignal) => {
    setIsQueueLoading(true);
    setQueueError(null);

    try {
      const loadedListings = await requestListings(signal);
      setListings(loadedListings);
      setSelectedListing((current) =>
        loadedListings.find((listing) => listing.id === current?.id) ??
        loadedListings[0] ??
        null,
      );
    } catch (error) {
      if ((error as Error).name !== "AbortError") {
        setListings([]);
        setQueueError("Non riusciamo a caricare la coda.");
      }
    } finally {
      if (!signal?.aborted) {
        setIsQueueLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void requestListings(controller.signal)
      .then((loadedListings) => {
        setListings(loadedListings);
        setSelectedListing((current) =>
          loadedListings.find((listing) => listing.id === current?.id) ??
          loadedListings[0] ??
          null,
        );
        setQueueError(null);
      })
      .catch((error: Error) => {
        if (error.name !== "AbortError") {
          setListings([]);
          setQueueError("Non riusciamo a caricare la coda.");
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setIsQueueLoading(false);
        }
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    return () => {
      photos.forEach(({ url }) => URL.revokeObjectURL(url));
    };
  }, [photos]);

  function handlePhotosChange(event: ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(event.target.files ?? []).slice(0, 10);
    setPhotos(
      selected.map((file) => ({
        file,
        url: URL.createObjectURL(file),
      })),
    );
  }

  function updateSelectedListing<K extends keyof Listing>(
    field: K,
    value: Listing[K],
  ) {
    setSelectedListing((current) =>
      current ? { ...current, [field]: value } : current,
    );
  }

  async function copyField(label: string, value: string) {
    setEditorError(null);
    try {
      await navigator.clipboard.writeText(value);
      setEditorMessage(`${label} copiato.`);
    } catch {
      setEditorMessage(null);
      setEditorError("Copia non riuscita. Seleziona il testo manualmente.");
    }
  }

  async function persistListing(listing: Listing) {
    const response = await fetch(
        `${API_BASE_URL}/api/listings/${listing.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            item_type: listing.item_type,
            brand: listing.brand,
            size: listing.size,
            title: listing.title,
            description: listing.description,
            category: listing.category,
            condition: listing.condition,
            price: listing.price,
            parcel_size: listing.parcel_size,
            status: listing.status,
          }),
        },
      );
    if (!response.ok) {
      throw new Error("Impossibile salvare la bozza");
    }
    const updated = (await response.json()) as Listing;
    setSelectedListing(updated);
    setListings((current) =>
      current.map((currentListing) =>
        currentListing.id === updated.id ? updated : currentListing,
      ),
    );
    return updated;
  }

  async function saveSelectedListing() {
    if (!selectedListing) return;
    setIsSaving(true);
    setEditorMessage(null);
    setEditorError(null);
    try {
      await persistListing(selectedListing);
      setEditorMessage("Modifiche salvate.");
    } catch {
      setEditorError("Non è stato possibile salvare. Riprova.");
    } finally {
      setIsSaving(false);
    }
  }

  async function transferSelectedListing() {
    if (!selectedListing) return;
    setEditorMessage(null);
    setEditorError(null);
    const popup = window.open("about:blank", "_blank");
    if (!popup) {
      setEditorError(
        "Il browser ha bloccato la nuova scheda. Consenti i popup e riprova.",
      );
      return;
    }
    popup.opener = null;
    setIsTransferring(true);
    try {
      const updated = await persistListing(selectedListing);
      popup.location.href = `${VINTED_NEW_ITEM_URL}#vinted-assistant=${encodeURIComponent(
        updated.id,
      )}`;
      setEditorMessage(
        "Bozza salvata. Controlla il modulo Vinted nella nuova scheda.",
      );
    } catch {
      popup.close();
      setEditorError(
        "Non è stato possibile preparare il trasferimento. Riprova.",
      );
    } finally {
      setIsTransferring(false);
    }
  }

  async function deleteSelectedListing() {
    if (!selectedListing) return;
    if (!window.confirm("Eliminare questa bozza e le fotografie salvate?")) {
      return;
    }
    setIsDeleting(true);
    setEditorMessage(null);
    setEditorError(null);
    try {
      const response = await fetch(
        `${API_BASE_URL}/api/listings/${selectedListing.id}`,
        { method: "DELETE" },
      );
      if (!response.ok) {
        throw new Error("Impossibile eliminare la bozza");
      }
      const deletedId = selectedListing.id;
      setListings((current) =>
        current.filter((listing) => listing.id !== deletedId),
      );
      setSelectedListing(null);
    } catch {
      setEditorError("Non è stato possibile eliminare la bozza.");
    } finally {
      setIsDeleting(false);
    }
  }

  async function handleCreateListing(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIntakeError(null);
    if (photos.length === 0) {
      setIntakeSuccess(null);
      setIntakeError("Aggiungi almeno una foto dell'articolo.");
      return;
    }
    const form = event.currentTarget;
    const values = new FormData(form);
    const payload = new FormData();

    photos.forEach(({ file }) => payload.append("photos", file, file.name));
    (
      [
        "note",
        "item_type",
        "brand",
        "size",
        "condition",
        "price_mode",
        "explicit_price",
      ] as const
    ).forEach((field) => {
      const value = values.get(field);
      if (typeof value === "string" && value.trim()) {
        payload.append(field, value.trim());
      }
    });

    setIsCreating(true);
    setIntakeSuccess(null);

    try {
      const response = await fetch(`${API_BASE_URL}/api/listings`, {
        method: "POST",
        body: payload,
      });
      if (!response.ok) {
        throw new Error("Impossibile creare la bozza");
      }

      const created = (await response.json()) as Listing;
      setListings((current) => [
        created,
        ...current.filter((item) => item.id !== created.id),
      ]);
      setSelectedListing({ ...created });
      setIntakeSuccess("Bozza creata e aggiunta alla coda.");
      setIntakeError(null);
      form.reset();
      setPhotos([]);
    } catch {
      setIntakeSuccess(null);
      setIntakeError("Non è stato possibile creare la bozza. Riprova.");
    } finally {
      setIsCreating(false);
    }
  }

  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <div className={styles.brand}>
          <span className={styles.brandMark} aria-hidden="true">
            V
          </span>
          <div>
            <h1>Vinted Assistant</h1>
            <p>Prepara tutto qui. Pubblica solo quando sei pronto.</p>
          </div>
        </div>
        <div className={styles.localBadge}>
          <span aria-hidden="true" />
          Dati locali
        </div>
      </header>
      <main className={styles.dashboard}>
        <section
          className={`${styles.panel} ${styles.intakePanel}`}
          aria-labelledby="intake-heading"
        >
          <div className={styles.panelHeading}>
            <div>
              <span className={styles.eyebrow}>01 · RACCOLTA</span>
              <h2 id="intake-heading">Nuovo articolo</h2>
            </div>
            <span className={styles.stepBadge}>Foto → bozza</span>
          </div>
          <form className={styles.intakeForm} onSubmit={handleCreateListing}>
            <label className={styles.fileLabel} htmlFor="photos">
              <span className={styles.fileIcon} aria-hidden="true">
                ＋
              </span>
              <strong>Foto dell&apos;articolo</strong>
              <small>JPG, PNG o WEBP · massimo 10 foto</small>
            </label>
            <input
              className={styles.fileInput}
              aria-label="Foto dell'articolo"
              id="photos"
              name="photos"
              type="file"
              accept="image/*"
              multiple
              onChange={handlePhotosChange}
            />
            <div className={styles.previewGrid} aria-live="polite">
              {photos.map(({ file, url }) => (
                <Image
                  className={styles.previewImage}
                  key={`${file.name}-${file.lastModified}`}
                  src={url}
                  alt={`Anteprima ${file.name}`}
                  width={120}
                  height={120}
                  unoptimized
                />
              ))}
            </div>

            <label htmlFor="note">Nota in italiano</label>
            <textarea id="note" name="note" required />

            <label htmlFor="item-type">Tipo di articolo</label>
            <input id="item-type" name="item_type" type="text" />

            <label htmlFor="brand">Marca</label>
            <input id="brand" name="brand" type="text" />

            <label htmlFor="size">Taglia</label>
            <input id="size" name="size" type="text" />

            <label htmlFor="condition">Condizione</label>
            <select
              id="condition"
              name="condition"
              defaultValue="Buone condizioni"
            >
              <option>Nuovo con cartellino</option>
              <option>Nuovo senza cartellino</option>
              <option>Ottime condizioni</option>
              <option>Buone condizioni</option>
              <option>Condizioni soddisfacenti</option>
            </select>

            <label htmlFor="price-mode">Strategia prezzo</label>
            <select id="price-mode" name="price_mode" defaultValue="balanced">
              <option value="quick">Vendita rapida</option>
              <option value="balanced">Equilibrato</option>
              <option value="maximize">Massimo ricavo</option>
            </select>

            <label htmlFor="explicit-price">Prezzo esplicito (€)</label>
            <input
              id="explicit-price"
              name="explicit_price"
              type="number"
              min="0"
              step="0.01"
            />

            <button
              className={styles.primaryButton}
              type="submit"
              disabled={isCreating}
            >
              {isCreating ? "Generazione…" : "Genera bozza"}
            </button>
          </form>
          {intakeSuccess ? (
            <p className={styles.successMessage} role="status">
              {intakeSuccess}
            </p>
          ) : null}
          {intakeError ? (
            <p className={styles.errorMessage} role="alert">
              {intakeError}
            </p>
          ) : null}
        </section>
        <aside
          className={`${styles.panel} ${styles.queuePanel}`}
          aria-labelledby="queue-heading"
        >
          <div className={styles.panelHeading}>
            <div>
              <span className={styles.eyebrow}>02 · CODA</span>
              <h2 id="queue-heading">Coda annunci</h2>
            </div>
            <span className={styles.countBadge}>{listings.length}</span>
          </div>
          {isQueueLoading ? (
            <p className={styles.muted}>Caricamento annunci…</p>
          ) : null}
          {!isQueueLoading && queueError ? (
            <div
              className={styles.emptyState}
              role="alert"
              aria-label={queueError}
            >
              <p>{queueError}</p>
              <button type="button" onClick={() => void loadListings()}>
                Riprova
              </button>
            </div>
          ) : null}
          {!isQueueLoading && !queueError && listings.length === 0 ? (
            <div className={styles.emptyState}>
              <p>La coda è vuota</p>
              <p>Carica le foto del primo articolo per iniziare.</p>
            </div>
          ) : null}
          {!isQueueLoading && !queueError && listings.length > 0 ? (
            <ul className={styles.queueList}>
              {listings.map((listing) => {
                const statusLabel = STATUS_LABELS[listing.status] ?? listing.status;
                const priceLabel = formatPrice(listing.price);
                return (
                  <li key={listing.id}>
                    <button
                      className={`${styles.queueCard} ${
                        selectedListing?.id === listing.id
                          ? styles.queueCardActive
                          : ""
                      }`}
                      type="button"
                      aria-label={`${listing.title}, ${statusLabel}, ${priceLabel}`}
                      onClick={() => {
                        setSelectedListing({ ...listing });
                        setEditorMessage(null);
                        setEditorError(null);
                      }}
                    >
                      {listing.photo_urls[0] ? (
                        <Image
                          className={styles.queueThumb}
                          src={`${API_BASE_URL}${listing.photo_urls[0]}`}
                          alt=""
                          width={54}
                          height={54}
                          unoptimized
                        />
                      ) : (
                        <span
                          className={styles.queueThumbPlaceholder}
                          aria-hidden="true"
                        >
                          V
                        </span>
                      )}
                      <span className={styles.queueCardBody}>
                        <span className={styles.queueTitle}>{listing.title}</span>
                        <span className={styles.queueMeta}>
                          <span>{statusLabel}</span>
                          <strong>{priceLabel}</strong>
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : null}
        </aside>
        <section
          className={`${styles.panel} ${styles.editorPanel}`}
          aria-labelledby="editor-heading"
        >
          <div className={styles.panelHeading}>
            <div>
              <span className={styles.eyebrow}>03 · REVISIONE</span>
              <h2 id="editor-heading">Dettagli annuncio</h2>
            </div>
            {selectedListing ? (
              <span
                className={styles.statusBadge}
                data-status={selectedListing.status}
              >
                {STATUS_LABELS[selectedListing.status] ?? selectedListing.status}
              </span>
            ) : null}
          </div>
          {!selectedListing ? (
            <div className={styles.editorEmpty}>
              <span aria-hidden="true">↗</span>
              <p>Seleziona un annuncio dalla coda per modificarlo.</p>
            </div>
          ) : (
            <div className={styles.editorForm}>
              <div className={styles.savedPhotos}>
                {selectedListing.photo_urls.map((photoUrl, index) => (
                  <Image
                    key={photoUrl}
                    src={`${API_BASE_URL}${photoUrl}`}
                    alt={`Foto salvata ${index + 1}`}
                    width={112}
                    height={112}
                    unoptimized
                  />
                ))}
              </div>
              <label htmlFor="listing-title">Titolo</label>
              <input
                id="listing-title"
                value={selectedListing.title}
                onChange={(event) =>
                  updateSelectedListing("title", event.target.value)
                }
              />
              <button
                className={styles.copyButton}
                type="button"
                aria-label="Copia titolo"
                onClick={() => void copyField("Titolo", selectedListing.title)}
              >
                Copia
              </button>

              <label htmlFor="listing-description">Descrizione</label>
              <textarea
                id="listing-description"
                value={selectedListing.description}
                onChange={(event) =>
                  updateSelectedListing("description", event.target.value)
                }
              />
              <button
                className={styles.copyButton}
                type="button"
                aria-label="Copia descrizione"
                onClick={() =>
                  void copyField("Descrizione", selectedListing.description)
                }
              >
                Copia
              </button>

              <label htmlFor="listing-category">Categoria</label>
              <input
                id="listing-category"
                value={selectedListing.category}
                onChange={(event) =>
                  updateSelectedListing("category", event.target.value)
                }
              />
              <button
                className={styles.copyButton}
                type="button"
                aria-label="Copia categoria"
                onClick={() =>
                  void copyField("Categoria", selectedListing.category)
                }
              >
                Copia
              </button>

              <label htmlFor="listing-item-type">Tipo articolo annuncio</label>
              <input
                id="listing-item-type"
                value={selectedListing.item_type ?? ""}
                onChange={(event) =>
                  updateSelectedListing("item_type", event.target.value || null)
                }
              />
              <button
                className={styles.copyButton}
                type="button"
                aria-label="Copia tipo articolo"
                onClick={() =>
                  void copyField("Tipo articolo", selectedListing.item_type ?? "")
                }
              >
                Copia
              </button>

              <label htmlFor="listing-brand">Marca annuncio</label>
              <input
                id="listing-brand"
                value={selectedListing.brand ?? ""}
                onChange={(event) =>
                  updateSelectedListing("brand", event.target.value || null)
                }
              />
              <button
                className={styles.copyButton}
                type="button"
                aria-label="Copia marca"
                onClick={() =>
                  void copyField("Marca", selectedListing.brand ?? "")
                }
              >
                Copia
              </button>

              <label htmlFor="listing-size">Taglia annuncio</label>
              <input
                id="listing-size"
                value={selectedListing.size ?? ""}
                onChange={(event) =>
                  updateSelectedListing("size", event.target.value || null)
                }
              />
              <button
                className={styles.copyButton}
                type="button"
                aria-label="Copia taglia"
                onClick={() => void copyField("Taglia", selectedListing.size ?? "")}
              >
                Copia
              </button>

              <label htmlFor="listing-condition">Condizione annuncio</label>
              <select
                id="listing-condition"
                value={selectedListing.condition}
                onChange={(event) =>
                  updateSelectedListing("condition", event.target.value)
                }
              >
                <option>Nuovo con cartellino</option>
                <option>Nuovo senza cartellino</option>
                <option>Ottime condizioni</option>
                <option>Buone condizioni</option>
                <option>Condizioni soddisfacenti</option>
              </select>
              <button
                className={styles.copyButton}
                type="button"
                aria-label="Copia condizione"
                onClick={() =>
                  void copyField("Condizione", selectedListing.condition)
                }
              >
                Copia
              </button>

              <label htmlFor="listing-price">Prezzo (€)</label>
              <input
                id="listing-price"
                type="number"
                min="0"
                step="0.01"
                value={selectedListing.price}
                onChange={(event) =>
                  updateSelectedListing("price", Number(event.target.value))
                }
              />
              <button
                className={styles.copyButton}
                type="button"
                aria-label="Copia prezzo"
                onClick={() =>
                  void copyField(
                    "Prezzo",
                    selectedListing.price.toFixed(2).replace(".", ","),
                  )
                }
              >
                Copia
              </button>

              <label htmlFor="listing-parcel">Dimensione pacco</label>
              <select
                id="listing-parcel"
                value={selectedListing.parcel_size}
                onChange={(event) =>
                  updateSelectedListing("parcel_size", event.target.value)
                }
              >
                <option>Piccolo</option>
                <option>Medio</option>
                <option>Grande</option>
              </select>
              <button
                className={styles.copyButton}
                type="button"
                aria-label="Copia dimensione pacco"
                onClick={() =>
                  void copyField("Dimensione pacco", selectedListing.parcel_size)
                }
              >
                Copia
              </button>

              <label htmlFor="listing-status">Stato</label>
              <select
                className={styles.fullWidthControl}
                id="listing-status"
                value={selectedListing.status}
                onChange={(event) =>
                  updateSelectedListing("status", event.target.value)
                }
              >
                <option value="ready">Pronto</option>
                <option value="vinted_draft">Bozza Vinted</option>
                <option value="published">Pubblicato</option>
              </select>

              <div className={styles.editorActions}>
                <button
                  className={styles.vintedButton}
                  type="button"
                  disabled={isTransferring}
                  onClick={() => void transferSelectedListing()}
                >
                  {isTransferring ? "Preparazione…" : "Trasferisci su Vinted"}
                </button>
                <button
                  className={styles.primaryButton}
                  type="button"
                  disabled={isSaving}
                  onClick={() => void saveSelectedListing()}
                >
                  {isSaving ? "Salvataggio…" : "Salva modifiche"}
                </button>
                <button
                  className={styles.dangerButton}
                  type="button"
                  disabled={isDeleting}
                  onClick={() => void deleteSelectedListing()}
                >
                  {isDeleting ? "Eliminazione…" : "Elimina bozza"}
                </button>
              </div>
              {editorMessage ? (
                <p className={styles.successMessage} role="status">
                  {editorMessage}
                </p>
              ) : null}
              {editorError ? (
                <p className={styles.errorMessage} role="alert">
                  {editorError}
                </p>
              ) : null}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

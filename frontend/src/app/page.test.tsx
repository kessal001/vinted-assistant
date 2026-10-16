import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import Home from "./page";

const listing = {
  id: "9f42a8b2-17d6-4725-943f-7d45e93bed8b",
  photo_urls: ["/uploads/front.jpg"],
  item_type: "maglietta",
  brand: "Uniqlo",
  size: "M",
  title: "Uniqlo Maglietta - Taglia M",
  description: "Maglietta a righe in ottime condizioni.",
  category: "Donna > Abbigliamento > Top e magliette",
  condition: "Ottime condizioni",
  price: 12,
  parcel_size: "Piccolo",
  status: "ready",
  created_at: "2026-10-04T08:00:00Z",
  updated_at: "2026-10-04T08:00:00Z",
};

function jsonResponse(data: unknown, status = 200) {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    json: async () => data,
  } as Response);
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(() => jsonResponse([])));
});

describe("Vinted Assistant dashboard", () => {
  it("renders the three-part dashboard shell", () => {
    render(<Home />);

    expect(
      screen.getByRole("heading", { name: "Vinted Assistant" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Nuovo articolo" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Coda annunci" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Dettagli annuncio" }),
    ).toBeInTheDocument();
  });

  it("shows previews for every selected photo", async () => {
    const user = userEvent.setup();
    vi.spyOn(URL, "createObjectURL")
      .mockReturnValueOnce("blob:front")
      .mockReturnValueOnce("blob:label");

    render(<Home />);

    const front = new File(["front"], "fronte.jpg", { type: "image/jpeg" });
    const label = new File(["label"], "etichetta.png", { type: "image/png" });

    await user.upload(screen.getByLabelText("Foto dell'articolo"), [
      front,
      label,
    ]);

    expect(screen.getByAltText("Anteprima fronte.jpg")).toHaveAttribute(
      "src",
      "blob:front",
    );
    expect(screen.getByAltText("Anteprima etichetta.png")).toHaveAttribute(
      "src",
      "blob:label",
    );
  });

  it("offers the Italian intake fields and price strategies", () => {
    render(<Home />);

    expect(screen.getByLabelText("Nota in italiano")).toBeRequired();
    expect(screen.getByLabelText("Tipo di articolo")).toBeInTheDocument();
    expect(screen.getByLabelText("Marca")).toBeInTheDocument();
    expect(screen.getByLabelText("Taglia")).toBeInTheDocument();
    expect(screen.getByLabelText("Condizione")).toHaveValue(
      "Buone condizioni",
    );
    expect(screen.getByLabelText("Strategia prezzo")).toHaveValue("balanced");
    expect(screen.getByRole("option", { name: "Vendita rapida" })).toHaveValue(
      "quick",
    );
    expect(screen.getByRole("option", { name: "Massimo ricavo" })).toHaveValue(
      "maximize",
    );
    expect(screen.getByLabelText("Prezzo esplicito (€)")).toHaveAttribute(
      "step",
      "0.01",
    );
    expect(
      screen.getByRole("button", { name: "Genera bozza" }),
    ).toBeInTheDocument();
  });

  it("loads saved listings into the queue", async () => {
    vi.mocked(fetch).mockImplementationOnce(() => jsonResponse([listing]));

    render(<Home />);

    expect(screen.getByText("Caricamento annunci…")).toBeInTheDocument();
    expect(
      await screen.findByRole("button", {
        name: "Uniqlo Maglietta - Taglia M, Pronto, 12,00 €",
      }),
    ).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith(
      "http://127.0.0.1:8000/api/listings",
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it("shows a helpful empty queue state", async () => {
    render(<Home />);

    expect(await screen.findByText("La coda è vuota")).toBeInTheDocument();
    expect(
      screen.getByText("Carica le foto del primo articolo per iniziare."),
    ).toBeInTheDocument();
  });

  it("shows a recoverable queue error", async () => {
    const user = userEvent.setup();
    vi.mocked(fetch)
      .mockImplementationOnce(() => jsonResponse({ detail: "Errore" }, 500))
      .mockImplementationOnce(() => jsonResponse([listing]));

    render(<Home />);

    expect(
      await screen.findByRole("alert", {
        name: "Non riusciamo a caricare la coda.",
      }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Riprova" }));

    expect(
      await screen.findByRole("button", {
        name: "Uniqlo Maglietta - Taglia M, Pronto, 12,00 €",
      }),
    ).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("automatically opens the first queued listing for editing", async () => {
    vi.mocked(fetch).mockImplementationOnce(() => jsonResponse([listing]));

    render(<Home />);

    expect(await screen.findByLabelText("Titolo")).toHaveValue(listing.title);
    expect(screen.getByLabelText("Descrizione")).toHaveValue(
      listing.description,
    );
    expect(screen.getByLabelText("Categoria")).toHaveValue(listing.category);
    expect(screen.getByLabelText("Tipo articolo annuncio")).toHaveValue(
      listing.item_type,
    );
    expect(screen.getByLabelText("Marca annuncio")).toHaveValue(listing.brand);
    expect(screen.getByLabelText("Taglia annuncio")).toHaveValue(listing.size);
    expect(screen.getByLabelText("Condizione annuncio")).toHaveValue(
      listing.condition,
    );
    expect(screen.getByLabelText("Prezzo (€)")).toHaveValue(listing.price);
    expect(screen.getByLabelText("Dimensione pacco")).toHaveValue(
      listing.parcel_size,
    );
  });

  it("creates a listing with the backend multipart contract", async () => {
    const user = userEvent.setup();
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:front");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    vi.mocked(fetch)
      .mockImplementationOnce(() => jsonResponse([]))
      .mockImplementationOnce(() => jsonResponse(listing, 201));

    render(<Home />);

    const photo = new File(["photo"], "maglietta.jpg", {
      type: "image/jpeg",
    });
    await user.upload(screen.getByLabelText("Foto dell'articolo"), photo);
    await user.type(
      screen.getByLabelText("Nota in italiano"),
      "Maglia a righe blu, usata due volte.",
    );
    await user.type(screen.getByLabelText("Tipo di articolo"), "maglietta");
    await user.type(screen.getByLabelText("Marca"), "Uniqlo");
    await user.type(screen.getByLabelText("Taglia"), "M");
    await user.selectOptions(
      screen.getByLabelText("Condizione"),
      "Ottime condizioni",
    );
    await user.selectOptions(screen.getByLabelText("Strategia prezzo"), "quick");
    await user.type(screen.getByLabelText("Prezzo esplicito (€)"), "19.5");

    await user.click(screen.getByRole("button", { name: "Genera bozza" }));

    expect(await screen.findByRole("status")).toHaveTextContent(
      "Bozza creata e aggiunta alla coda.",
    );
    const [, request] = vi.mocked(fetch).mock.calls[1];
    expect(vi.mocked(fetch).mock.calls[1][0]).toBe(
      "http://127.0.0.1:8000/api/listings",
    );
    expect(request).toMatchObject({ method: "POST" });
    const body = request?.body as FormData;
    expect(body).toBeInstanceOf(FormData);
    expect((body.get("photos") as File).name).toBe("maglietta.jpg");
    expect(body.get("note")).toBe("Maglia a righe blu, usata due volte.");
    expect(body.get("item_type")).toBe("maglietta");
    expect(body.get("brand")).toBe("Uniqlo");
    expect(body.get("size")).toBe("M");
    expect(body.get("condition")).toBe("Ottime condizioni");
    expect(body.get("price_mode")).toBe("quick");
    expect(body.get("explicit_price")).toBe("19.5");
    expect(screen.getByLabelText("Nota in italiano")).toHaveValue("");
    expect(
      screen.getByRole("button", {
        name: "Uniqlo Maglietta - Taglia M, Pronto, 12,00 €",
      }),
    ).toBeInTheDocument();
  });

  it("requires at least one real photo before creating a draft", async () => {
    const user = userEvent.setup();
    render(<Home />);

    await user.type(
      screen.getByLabelText("Nota in italiano"),
      "Articolo in ottime condizioni.",
    );
    await user.click(screen.getByRole("button", { name: "Genera bozza" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Aggiungi almeno una foto dell'articolo.",
    );
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("saves edited listing fields through a JSON patch", async () => {
    const user = userEvent.setup();
    const updated = {
      ...listing,
      title: "Titolo definitivo",
      brand: "Arket",
      price: 15,
    };
    vi.mocked(fetch)
      .mockImplementationOnce(() => jsonResponse([listing]))
      .mockImplementationOnce(() => jsonResponse(updated));
    render(<Home />);

    await user.click(
      await screen.findByRole("button", {
        name: "Uniqlo Maglietta - Taglia M, Pronto, 12,00 €",
      }),
    );
    await user.clear(screen.getByLabelText("Titolo"));
    await user.type(screen.getByLabelText("Titolo"), "Titolo definitivo");
    await user.clear(screen.getByLabelText("Prezzo (€)"));
    await user.type(screen.getByLabelText("Prezzo (€)"), "15");
    await user.clear(screen.getByLabelText("Marca annuncio"));
    await user.type(screen.getByLabelText("Marca annuncio"), "Arket");
    await user.click(screen.getByRole("button", { name: "Salva modifiche" }));

    expect(await screen.findByRole("status")).toHaveTextContent(
      "Modifiche salvate.",
    );
    const request = vi.mocked(fetch).mock.calls[1][1];
    expect(fetch).toHaveBeenLastCalledWith(
      `http://127.0.0.1:8000/api/listings/${listing.id}`,
      expect.objectContaining({
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: expect.stringContaining('"title":"Titolo definitivo"'),
      }),
    );
    expect(String(request?.body)).toContain('"brand":"Arket"');
    expect(
      screen.getByRole("button", {
        name: "Titolo definitivo, Pronto, 15,00 €",
      }),
    ).toBeInTheDocument();
  });

  it("copies prepared fields without selecting text manually", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    vi.mocked(fetch).mockImplementationOnce(() => jsonResponse([listing]));
    render(<Home />);

    await user.click(
      await screen.findByRole("button", {
        name: "Uniqlo Maglietta - Taglia M, Pronto, 12,00 €",
      }),
    );
    await user.click(screen.getByRole("button", { name: "Copia titolo" }));
    await user.click(screen.getByRole("button", { name: "Copia prezzo" }));

    expect(writeText).toHaveBeenNthCalledWith(1, listing.title);
    expect(writeText).toHaveBeenNthCalledWith(2, "12,00");
    expect(screen.getByRole("status")).toHaveTextContent("Prezzo copiato.");
  });

  it("tracks whether an item is ready, a Vinted draft, or published", async () => {
    const user = userEvent.setup();
    const updated = { ...listing, status: "vinted_draft" };
    vi.mocked(fetch)
      .mockImplementationOnce(() => jsonResponse([listing]))
      .mockImplementationOnce(() => jsonResponse(updated));
    render(<Home />);

    await user.click(
      await screen.findByRole("button", {
        name: "Uniqlo Maglietta - Taglia M, Pronto, 12,00 €",
      }),
    );
    await user.selectOptions(screen.getByLabelText("Stato"), "vinted_draft");
    await user.click(screen.getByRole("button", { name: "Salva modifiche" }));

    expect(await screen.findByRole("status")).toHaveTextContent(
      "Modifiche salvate.",
    );
    const request = vi.mocked(fetch).mock.calls[1][1];
    expect(JSON.parse(String(request?.body))).toMatchObject({
      status: "vinted_draft",
    });
    expect(
      screen.getByRole("button", {
        name: "Uniqlo Maglietta - Taglia M, Bozza Vinted, 12,00 €",
      }),
    ).toBeInTheDocument();
  });

  it("deletes a draft only after confirmation", async () => {
    const user = userEvent.setup();
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    vi.mocked(fetch)
      .mockImplementationOnce(() => jsonResponse([listing]))
      .mockImplementationOnce(() => jsonResponse(null, 204));
    render(<Home />);

    await user.click(
      await screen.findByRole("button", {
        name: "Uniqlo Maglietta - Taglia M, Pronto, 12,00 €",
      }),
    );
    await user.click(screen.getByRole("button", { name: "Elimina bozza" }));

    expect(confirm).toHaveBeenCalledWith(
      "Eliminare questa bozza e le fotografie salvate?",
    );
    expect(fetch).toHaveBeenLastCalledWith(
      `http://127.0.0.1:8000/api/listings/${listing.id}`,
      { method: "DELETE" },
    );
    expect(await screen.findByText("La coda è vuota")).toBeInTheDocument();
    expect(
      screen.getByText("Seleziona un annuncio dalla coda per modificarlo."),
    ).toBeInTheDocument();
  });

  it("saves current edits before opening the official Vinted bridge handoff", async () => {
    const user = userEvent.setup();
    const updated = { ...listing, title: "Titolo da trasferire" };
    const popup = {
      opener: {} as unknown,
      location: { href: "" },
      close: vi.fn(),
    };
    const open = vi
      .spyOn(window, "open")
      .mockReturnValue(popup as unknown as Window);
    vi.mocked(fetch)
      .mockImplementationOnce(() => jsonResponse([listing]))
      .mockImplementationOnce(() => jsonResponse(updated));
    render(<Home />);

    const title = await screen.findByLabelText("Titolo");
    await user.clear(title);
    await user.type(title, "Titolo da trasferire");
    await user.click(
      screen.getByRole("button", { name: "Trasferisci su Vinted" }),
    );

    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    const request = vi.mocked(fetch).mock.calls[1][1];
    expect(JSON.parse(String(request?.body))).toMatchObject({
      title: "Titolo da trasferire",
      item_type: listing.item_type,
      brand: listing.brand,
      size: listing.size,
    });
    expect(open).toHaveBeenCalledWith("about:blank", "_blank");
    expect(popup.opener).toBeNull();
    await vi.waitFor(() => {
      expect(popup.location.href).toBe(
        `https://www.vinted.it/items/new#vinted-assistant=${listing.id}`,
      );
    });
  });
});

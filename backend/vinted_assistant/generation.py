from dataclasses import dataclass


@dataclass(frozen=True)
class GeneratedDraft:
    title: str
    description: str
    category: str
    condition: str
    price: float
    parcel_size: str


_ITEM_PROFILES = {
    "maglietta": ("Abbigliamento > Top e magliette", 12.0, "Piccolo"),
    "giacca": ("Abbigliamento > Cappotti e giacche", 35.0, "Medio"),
    "libro": ("Libri e media > Libri", 10.0, "Medio"),
}
_CONDITION_FACTORS = {
    "nuovo con cartellino": 1.35,
    "nuovo senza cartellino": 1.20,
    "ottime condizioni": 1.00,
    "buone condizioni": 0.80,
    "condizioni soddisfacenti": 0.60,
}
_PRICE_MODES = {
    "quick": (0.80, "vendita rapida"),
    "balanced": (1.00, "equilibrata"),
    "maximize": (1.20, "massimo ricavo"),
}
SUPPORTED_PRICE_MODES = frozenset(_PRICE_MODES)


def generate_draft(
    *,
    note: str,
    item_type: str | None,
    brand: str | None,
    size: str | None,
    condition: str,
    price_mode: str,
    explicit_price: float | None,
) -> GeneratedDraft:
    """Generate a deterministic Italian draft without external services."""
    normalized_type = (item_type or "articolo").strip()
    display_type = normalized_type.capitalize()
    clean_brand = (brand or "").strip()
    clean_size = (size or "").strip()

    title_parts = [part for part in (clean_brand, display_type) if part]
    title = " ".join(title_parts)
    if clean_size:
        title = f"{title} - Taglia {clean_size}"

    title = title[:100].rstrip()

    subject = display_type
    if clean_brand:
        subject += f" {clean_brand}"
    if clean_size:
        subject += f", taglia {clean_size}"
    profile = _ITEM_PROFILES.get(
        normalized_type.casefold(), ("Altro", 18.0, "Medio")
    )
    category, base_price, parcel_size = profile

    if explicit_price is not None:
        price = round(float(explicit_price), 2)
        price_sentence = "Prezzo indicato manualmente."
    else:
        strategy_factor, strategy_label = _PRICE_MODES[price_mode]
        condition_factor = _CONDITION_FACTORS.get(condition.casefold(), 0.80)
        price = round(base_price * condition_factor * strategy_factor, 2)
        price_sentence = f"Prezzo suggerito con strategia {strategy_label}."

    description = (
        f"{subject}, in {condition.lower()}.\n\n"
        f"{note.strip()}\n\n"
        f"{price_sentence}"
    )

    return GeneratedDraft(
        title=title,
        description=description,
        category=category,
        condition=condition,
        price=price,
        parcel_size=parcel_size,
    )

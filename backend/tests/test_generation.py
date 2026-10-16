from vinted_assistant.generation import generate_draft


def test_generation_uses_listing_fields_and_balanced_price():
    draft = generate_draft(
        note="Maglia a righe blu, usata due volte.",
        item_type="maglietta",
        brand="Uniqlo",
        size="M",
        condition="Ottime condizioni",
        price_mode="balanced",
        explicit_price=None,
    )

    assert draft.title == "Uniqlo Maglietta - Taglia M"
    assert draft.description == (
        "Maglietta Uniqlo, taglia M, in ottime condizioni.\n\n"
        "Maglia a righe blu, usata due volte.\n\n"
        "Prezzo suggerito con strategia equilibrata."
    )
    assert draft.category == "Abbigliamento > Top e magliette"
    assert draft.condition == "Ottime condizioni"
    assert draft.price == 12.0
    assert draft.parcel_size == "Piccolo"


def test_explicit_price_overrides_price_strategy():
    draft = generate_draft(
        note="Giacca impermeabile.",
        item_type="giacca",
        brand="Patagonia",
        size="L",
        condition="Buone condizioni",
        price_mode="quick",
        explicit_price=24.50,
    )

    assert draft.price == 24.50
    assert draft.description.endswith("Prezzo indicato manualmente.")


def test_price_mode_changes_the_deterministic_suggestion():
    common = {
        "note": "Giacca impermeabile.",
        "item_type": "giacca",
        "brand": None,
        "size": None,
        "condition": "Buone condizioni",
        "explicit_price": None,
    }

    quick = generate_draft(price_mode="quick", **common)
    balanced = generate_draft(price_mode="balanced", **common)
    maximize = generate_draft(price_mode="maximize", **common)

    assert quick.price == 22.40
    assert balanced.price == 28.00
    assert maximize.price == 33.60
    assert quick.description.endswith("Prezzo suggerito con strategia vendita rapida.")
    assert maximize.description.endswith("Prezzo suggerito con strategia massimo ricavo.")


def test_book_profile_uses_vinted_book_category_and_medium_parcel():
    draft = generate_draft(
        note="Libro sigillato nel cellophane originale.",
        item_type="libro",
        brand=None,
        size=None,
        condition="Nuovo con cartellino",
        price_mode="maximize",
        explicit_price=None,
    )

    assert draft.category == "Libri e media > Libri"
    assert draft.parcel_size == "Medio"
    assert draft.price == 16.20

import sqlite3
from pathlib import Path
from uuid import UUID

from fastapi.testclient import TestClient

from conftest import make_image_bytes
from vinted_assistant.app import create_app


RESPONSE_FIELDS = {
    "id",
    "photo_urls",
    "item_type",
    "brand",
    "size",
    "title",
    "description",
    "category",
    "condition",
    "price",
    "parcel_size",
    "status",
    "created_at",
    "updated_at",
}


def test_post_listing_generates_and_persists_a_draft(tmp_path):
    database_path = tmp_path / "listings.db"
    upload_dir = tmp_path / "uploads"
    app = create_app(database_path=database_path, upload_dir=upload_dir)

    response = TestClient(app).post(
        "/api/listings",
        data={
            "note": "Maglia a righe blu, usata due volte.",
            "item_type": "maglietta",
            "brand": "Uniqlo",
            "size": "M",
            "condition": "Ottime condizioni",
            "price_mode": "balanced",
        },
        files=[
            ("photos", ("../../foto originale.jpg", make_image_bytes("JPEG"), "image/jpeg")),
            ("photos", ("seconda.png", make_image_bytes("PNG"), "image/png")),
        ],
    )

    assert response.status_code == 201, response.text
    payload = response.json()
    assert set(payload) == RESPONSE_FIELDS
    UUID(payload["id"])
    assert payload["title"] == "Uniqlo Maglietta - Taglia M"
    assert payload["item_type"] == "maglietta"
    assert payload["brand"] == "Uniqlo"
    assert payload["size"] == "M"
    assert payload["category"] == "Abbigliamento > Top e magliette"
    assert payload["condition"] == "Ottime condizioni"
    assert payload["price"] == 12.0
    assert payload["parcel_size"] == "Piccolo"
    assert payload["status"] == "ready"
    assert len(payload["photo_urls"]) == 2
    assert all(url.startswith("/uploads/") for url in payload["photo_urls"])

    with sqlite3.connect(database_path) as connection:
        listing_count = connection.execute("SELECT COUNT(*) FROM listings").fetchone()[0]
        photo_count = connection.execute("SELECT COUNT(*) FROM photos").fetchone()[0]
    assert listing_count == 1
    assert photo_count == 2
    assert len(list(Path(upload_dir).iterdir())) == 2


def test_uploaded_photo_is_served_from_its_generated_url(tmp_path):
    app = create_app(
        database_path=tmp_path / "listings.db",
        upload_dir=tmp_path / "uploads",
    )
    client = TestClient(app)
    original = make_image_bytes("JPEG")

    created = client.post(
        "/api/listings",
        data={"note": "Foto da servire", "price_mode": "balanced"},
        files={"photos": ("../../unsafe name.jpg", original, "image/jpeg")},
    )

    photo_url = created.json()["photo_urls"][0]
    filename = Path(photo_url).name
    assert filename != "unsafe name.jpg"
    assert len(Path(filename).stem) == 32
    assert Path(filename).suffix == ".jpg"

    response = client.get(photo_url)
    assert response.status_code == 200
    assert response.content == original
    assert response.headers["content-type"] == "image/jpeg"

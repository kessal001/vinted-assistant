from types import SimpleNamespace

from PIL import Image

from conftest import make_image_bytes
from fastapi.testclient import TestClient
from vinted_assistant import barcode
from vinted_assistant.app import create_app


def test_detect_barcodes_degrades_cleanly_when_decoder_is_unavailable(
    tmp_path, monkeypatch
):
    photo = tmp_path / "book.jpg"
    photo.write_bytes(make_image_bytes("JPEG"))

    def unavailable(_name: str):
        raise ModuleNotFoundError("decoder unavailable")

    monkeypatch.setattr(barcode.importlib, "import_module", unavailable)

    assert barcode.detect_barcodes([photo]) == []


def test_detect_barcodes_returns_unique_values(tmp_path, monkeypatch):
    photo = tmp_path / "book.jpg"
    photo.write_bytes(make_image_bytes("JPEG"))
    decoder = SimpleNamespace(
        decode=lambda _image: [
            SimpleNamespace(data=b"9781234567897"),
            SimpleNamespace(data=b"9781234567897"),
            SimpleNamespace(data=b"CODE-42"),
        ]
    )
    monkeypatch.setattr(barcode.importlib, "import_module", lambda _name: decoder)

    assert barcode.detect_barcodes([photo]) == ["9781234567897", "CODE-42"]


def test_create_listing_adds_detected_isbn_to_description(tmp_path, monkeypatch):
    app = create_app(
        database_path=tmp_path / "listings.db",
        upload_dir=tmp_path / "uploads",
    )
    monkeypatch.setattr(
        "vinted_assistant.service.detect_barcodes",
        lambda _paths: ["9781234567897"],
    )

    response = TestClient(app).post(
        "/api/listings",
        data={
            "note": "Libro ancora sigillato.",
            "item_type": "libro",
            "condition": "Nuovo con cartellino",
            "price_mode": "maximize",
        },
        files={"photos": ("book.jpg", make_image_bytes("JPEG"), "image/jpeg")},
    )

    assert response.status_code == 201, response.text
    assert response.json()["description"].endswith(
        "ISBN / codice rilevato: 9781234567897."
    )

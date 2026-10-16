import asyncio
import math
import sqlite3
from io import BytesIO

import pytest
from fastapi import UploadFile
from fastapi.testclient import TestClient
from starlette.datastructures import Headers

from conftest import make_image_bytes
from vinted_assistant.app import create_app
from vinted_assistant.models import ListingCreate
from vinted_assistant.service import ListingService
from vinted_assistant.settings import Settings


def client_at(tmp_path):
    return TestClient(create_app(database_path=tmp_path / "vinted.db", upload_dir=tmp_path / "uploads"))


def create(client):
    response = client.post("/api/listings", data={"note": "Foto reale"},
        files={"photos": ("photo.jpg", make_image_bytes(), "image/jpeg")})
    assert response.status_code == 201
    return response.json()


@pytest.mark.parametrize("value", ["nan", "inf", "-inf", "0.001", "1000001"])
def test_create_rejects_unstorable_prices_without_writing_photos(tmp_path, value):
    client = client_at(tmp_path)
    response = client.post("/api/listings", data={"note": "Libro", "explicit_price": value},
        files={"photos": ("photo.jpg", make_image_bytes(), "image/jpeg")})
    assert response.status_code == 422
    assert not (tmp_path / "uploads").exists()


@pytest.mark.parametrize("field", ["title", "description", "category", "condition", "price", "parcel_size", "status"])
def test_patch_null_required_field_returns_422_and_keeps_existing_draft(tmp_path, field):
    client = client_at(tmp_path)
    listing = create(client)
    response = client.patch(f"/api/listings/{listing['id']}", json={field: None})
    assert response.status_code == 422
    assert client.get(f"/api/listings/{listing['id']}").json() == listing


def test_patch_allows_clearing_optional_metadata(tmp_path):
    client = client_at(tmp_path)
    listing = create(client)
    response = client.patch(f"/api/listings/{listing['id']}", json={"brand": None, "size": None})
    assert response.status_code == 200


def test_database_failure_rolls_back_copied_photos_and_closes_handles(tmp_path, monkeypatch):
    service = ListingService(Settings(tmp_path / "vinted.db", tmp_path / "uploads"))
    image = BytesIO(make_image_bytes())
    upload = UploadFile(image, filename="image.jpg", headers=Headers({"content-type": "image/jpeg"}))
    def fail(**_kwargs):
        raise sqlite3.OperationalError("Simulated disk failure")
    monkeypatch.setattr(service.database, "create_listing", fail)
    with pytest.raises(sqlite3.OperationalError):
        asyncio.run(service.create(ListingCreate(note="Libro"), [upload]))
    assert image.closed
    assert list((tmp_path / "uploads").iterdir()) == []
    assert service.list() == []


def test_untrusted_webpage_cannot_create_or_change_local_drafts(tmp_path):
    client = client_at(tmp_path)
    response = client.post("/api/listings", headers={"Origin": "https://evil.example"},
        data={"note": "Attacco"}, files={"photos": ("photo.jpg", make_image_bytes(), "image/jpeg")})
    assert response.status_code == 403
    assert client.get("/api/listings").json() == []


def test_dns_rebinding_host_is_rejected(tmp_path):
    client = client_at(tmp_path)
    assert client.get("/api/listings", headers={"host": "evil.example"}).status_code == 400


def test_api_and_cli_settings_share_the_configured_data_dir(tmp_path, monkeypatch):
    monkeypatch.setenv("VINTED_ASSISTANT_DATA_DIR", str(tmp_path / "shared"))
    settings = Settings.from_env()
    app = create_app()
    assert app.state.database_path == settings.database_path == tmp_path / "shared" / "vinted.db"


def test_import_does_not_read_a_file_outside_configured_root(tmp_path):
    allowed = tmp_path / "photos"
    allowed.mkdir()
    photo = tmp_path / "outside.jpg"
    photo.write_bytes(make_image_bytes())
    service = ListingService(Settings(tmp_path / "vinted.db", tmp_path / "uploads"))
    with pytest.raises(ValueError, match="fuori"):
        asyncio.run(service.create_from_paths(ListingCreate(note="Libro"), [photo], allowed_root=allowed))
    assert not (tmp_path / "uploads").exists()

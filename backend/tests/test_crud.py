from fastapi.testclient import TestClient

from conftest import make_image_bytes
from test_creation import RESPONSE_FIELDS
from vinted_assistant.app import create_app


def _make_client(tmp_path) -> TestClient:
    app = create_app(
        database_path=tmp_path / "listings.db",
        upload_dir=tmp_path / "uploads",
    )
    return TestClient(app)


def _create_listing(client: TestClient, note: str = "Bozza di prova") -> dict:
    response = client.post(
        "/api/listings",
        data={
            "note": note,
            "item_type": "maglietta",
            "brand": "COS",
            "size": "S",
            "condition": "Ottime condizioni",
            "price_mode": "balanced",
        },
        files={"photos": ("photo.jpg", make_image_bytes("JPEG"), "image/jpeg")},
    )
    assert response.status_code == 201, response.text
    return response.json()


def test_list_listings_is_empty_for_a_new_database(tmp_path):
    response = _make_client(tmp_path).get("/api/listings")

    assert response.status_code == 200
    assert response.json() == []


def test_list_listings_returns_persisted_drafts_newest_first(tmp_path):
    client = _make_client(tmp_path)
    first = _create_listing(client, note="Prima bozza")
    second = _create_listing(client, note="Seconda bozza")

    response = client.get("/api/listings")

    assert response.status_code == 200
    payload = response.json()
    assert [item["id"] for item in payload] == [second["id"], first["id"]]
    assert all(set(item) == RESPONSE_FIELDS for item in payload)


def test_get_listing_reads_a_persisted_draft_by_id(tmp_path):
    created = _create_listing(_make_client(tmp_path))
    restarted_client = _make_client(tmp_path)

    response = restarted_client.get(f"/api/listings/{created['id']}")

    assert response.status_code == 200
    assert response.json() == created


def test_patch_listing_applies_json_partial_updates_and_persists_them(tmp_path):
    client = _make_client(tmp_path)
    created = _create_listing(client)

    first_patch = client.patch(
        f"/api/listings/{created['id']}",
        json={
            "title": "Titolo rivisto",
            "price": 19.90,
            "status": "vinted_draft",
        },
    )

    assert first_patch.status_code == 200, first_patch.text
    first_payload = first_patch.json()
    assert first_payload["title"] == "Titolo rivisto"
    assert first_payload["price"] == 19.90
    assert first_payload["status"] == "vinted_draft"
    assert first_payload["description"] == created["description"]
    assert first_payload["created_at"] == created["created_at"]
    assert first_payload["updated_at"] != created["updated_at"]

    second_patch = client.patch(
        f"/api/listings/{created['id']}",
        json={
            "description": "Descrizione rivista",
            "category": "Donna > Abbigliamento",
            "item_type": "camicia",
            "brand": "Arket",
            "size": "M",
            "condition": "Nuovo senza cartellino",
            "parcel_size": "Medio",
        },
    )
    assert second_patch.status_code == 200, second_patch.text
    second_payload = second_patch.json()
    assert second_payload["description"] == "Descrizione rivista"
    assert second_payload["category"] == "Donna > Abbigliamento"
    assert second_payload["item_type"] == "camicia"
    assert second_payload["brand"] == "Arket"
    assert second_payload["size"] == "M"
    assert second_payload["condition"] == "Nuovo senza cartellino"
    assert second_payload["parcel_size"] == "Medio"
    assert second_payload["title"] == "Titolo rivisto"
    assert _make_client(tmp_path).get(
        f"/api/listings/{created['id']}"
    ).json() == second_payload


def test_delete_listing_removes_the_draft_and_its_photos(tmp_path):
    client = _make_client(tmp_path)
    created = _create_listing(client)
    stored_photo = tmp_path / "uploads" / created["photo_urls"][0].split("/")[-1]
    assert stored_photo.exists()

    response = client.delete(f"/api/listings/{created['id']}")

    assert response.status_code == 204
    assert response.content == b""
    assert client.get(f"/api/listings/{created['id']}").status_code == 404
    assert not stored_photo.exists()
    assert client.delete(f"/api/listings/{created['id']}").status_code == 404

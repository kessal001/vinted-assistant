import json

from fastapi.testclient import TestClient

from conftest import make_image_bytes
from vinted_assistant.app import create_app
from vinted_assistant.cli import main


def test_cli_adds_a_local_draft_from_photo_paths(tmp_path, capsys):
    photo = tmp_path / "book.jpg"
    photo.write_bytes(make_image_bytes("JPEG"))
    database_path = tmp_path / "listings.db"
    upload_dir = tmp_path / "uploads"

    exit_code = main(
        [
            "add",
            "--photo",
            str(photo),
            "--note",
            "Libro sigillato e senza difetti.",
            "--item-type",
            "libro",
            "--condition",
            "Nuovo con cartellino",
            "--price-mode",
            "maximize",
            "--explicit-price",
            "15",
            "--database",
            str(database_path),
            "--uploads",
            str(upload_dir),
        ]
    )

    assert exit_code == 0
    payload = json.loads(capsys.readouterr().out)
    assert payload["title"] == "Libro"
    assert payload["price"] == 15.0
    assert len(payload["photo_urls"]) == 1
    assert (upload_dir / payload["photo_urls"][0].split("/")[-1]).exists()

    client = TestClient(
        create_app(database_path=database_path, upload_dir=upload_dir)
    )
    assert client.get(f"/api/listings/{payload['id']}").json() == payload

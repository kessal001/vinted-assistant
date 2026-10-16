from fastapi.testclient import TestClient

from conftest import make_image_bytes
from vinted_assistant.app import create_app


def test_post_rejects_more_than_ten_photos(tmp_path):
    app = create_app(
        database_path=tmp_path / "listings.db",
        upload_dir=tmp_path / "uploads",
    )
    photo = make_image_bytes("JPEG")
    files = [
        ("photos", (f"photo-{index}.jpg", photo, "image/jpeg"))
        for index in range(11)
    ]

    response = TestClient(app).post(
        "/api/listings",
        data={"note": "Troppe foto", "price_mode": "balanced"},
        files=files,
    )

    assert response.status_code == 422
    assert response.json()["detail"] == "Sono consentite da 1 a 10 foto."
    assert not (tmp_path / "uploads").exists()


def test_post_accepts_jpg_png_webp_and_rejects_other_mime_types(tmp_path):
    app = create_app(
        database_path=tmp_path / "listings.db",
        upload_dir=tmp_path / "uploads",
    )
    client = TestClient(app)

    for image_format, filename, content_type in (
        ("JPEG", "foto.jpg", "image/jpeg"),
        ("PNG", "foto.png", "image/png"),
        ("WEBP", "foto.webp", "image/webp"),
    ):
        response = client.post(
            "/api/listings",
            data={"note": f"Formato {image_format}", "price_mode": "balanced"},
            files={
                "photos": (
                    filename,
                    make_image_bytes(image_format),
                    content_type,
                )
            },
        )
        assert response.status_code == 201, response.text

    rejected = client.post(
        "/api/listings",
        data={"note": "Formato vietato", "price_mode": "balanced"},
        files={"photos": ("note.txt", b"testo", "text/plain")},
    )
    assert rejected.status_code == 415
    assert rejected.json()["detail"] == (
        "Formato foto non supportato: usare JPG, PNG o WEBP."
    )


def test_post_rejects_a_fake_image_even_with_an_allowed_mime_type(tmp_path):
    app = create_app(
        database_path=tmp_path / "listings.db",
        upload_dir=tmp_path / "uploads",
    )

    response = TestClient(app).post(
        "/api/listings",
        data={"note": "File falso", "price_mode": "balanced"},
        files={"photos": ("fake.jpg", b"not really an image", "image/jpeg")},
    )

    assert response.status_code == 415
    assert response.json()["detail"] == "Il file caricato non è un'immagine valida."
    assert not (tmp_path / "uploads").exists()


def test_post_rejects_mime_type_that_does_not_match_image_content(tmp_path):
    app = create_app(
        database_path=tmp_path / "listings.db",
        upload_dir=tmp_path / "uploads",
    )

    response = TestClient(app).post(
        "/api/listings",
        data={"note": "Tipo falso", "price_mode": "balanced"},
        files={
            "photos": (
                "claimed.jpg",
                make_image_bytes("PNG"),
                "image/jpeg",
            )
        },
    )

    assert response.status_code == 415
    assert response.json()["detail"] == "Il tipo dichiarato non corrisponde alla foto."
    assert not (tmp_path / "uploads").exists()


def test_post_rejects_a_photo_larger_than_ten_megabytes(tmp_path):
    app = create_app(
        database_path=tmp_path / "listings.db",
        upload_dir=tmp_path / "uploads",
    )
    jpeg = make_image_bytes("JPEG")
    oversized = jpeg + (b"\0" * (10 * 1024 * 1024 + 1 - len(jpeg)))

    response = TestClient(app).post(
        "/api/listings",
        data={"note": "Foto enorme", "price_mode": "balanced"},
        files={"photos": ("large.jpg", oversized, "image/jpeg")},
    )

    assert response.status_code == 413
    assert response.json()["detail"] == "Ogni foto deve essere al massimo di 10 MB."
    assert not (tmp_path / "uploads").exists()


def test_post_rejects_an_unknown_price_mode(tmp_path):
    app = create_app(
        database_path=tmp_path / "listings.db",
        upload_dir=tmp_path / "uploads",
    )

    response = TestClient(app, raise_server_exceptions=False).post(
        "/api/listings",
        data={"note": "Prezzo", "price_mode": "casuale"},
        files={"photos": ("photo.jpg", make_image_bytes("JPEG"), "image/jpeg")},
    )

    assert response.status_code == 422
    assert response.json()["detail"] == (
        "price_mode deve essere quick, balanced oppure maximize."
    )


def test_post_rejects_a_non_positive_explicit_price(tmp_path):
    app = create_app(
        database_path=tmp_path / "listings.db",
        upload_dir=tmp_path / "uploads",
    )

    response = TestClient(app).post(
        "/api/listings",
        data={
            "note": "Prezzo manuale",
            "price_mode": "balanced",
            "explicit_price": "0",
        },
        files={"photos": ("photo.jpg", make_image_bytes("JPEG"), "image/jpeg")},
    )

    assert response.status_code == 422
    assert response.json()["detail"] == "explicit_price deve essere maggiore di zero."


def test_post_rejects_a_blank_note(tmp_path):
    app = create_app(
        database_path=tmp_path / "listings.db",
        upload_dir=tmp_path / "uploads",
    )

    response = TestClient(app).post(
        "/api/listings",
        data={"note": "   ", "price_mode": "balanced"},
        files={"photos": ("photo.jpg", make_image_bytes("JPEG"), "image/jpeg")},
    )

    assert response.status_code == 422
    assert response.json()["detail"] == "note non può essere vuota."

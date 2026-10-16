from fastapi.testclient import TestClient

from vinted_assistant.app import create_app


def test_health_endpoint_reports_ok(tmp_path):
    app = create_app(
        database_path=tmp_path / "test.db",
        upload_dir=tmp_path / "uploads",
    )

    response = TestClient(app).get("/api/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_localhost_frontend_is_allowed_by_cors(tmp_path):
    app = create_app(
        database_path=tmp_path / "test.db",
        upload_dir=tmp_path / "uploads",
    )

    response = TestClient(app).options(
        "/api/listings",
        headers={
            "Origin": "http://localhost:3000",
            "Access-Control-Request-Method": "POST",
        },
    )

    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == "http://localhost:3000"

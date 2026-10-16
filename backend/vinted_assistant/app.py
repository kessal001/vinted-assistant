from pathlib import Path
from uuid import UUID

from fastapi import FastAPI, File, Form, Request, Response, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import ValidationError
from starlette.middleware.trustedhost import TrustedHostMiddleware

from .images import PhotoValidationError
from .models import ListingCreate, ListingPatch, ListingResponse
from .service import ListingNotFound, ListingService
from .settings import Settings


def create_app(*, database_path: Path | None = None, upload_dir: Path | None = None) -> FastAPI:
    configured = Settings.from_env()
    settings = Settings(
        Path(database_path or configured.database_path),
        Path(upload_dir or configured.upload_dir),
    )
    service = ListingService(settings)
    app = FastAPI(title="Vinted Assistant API", version="0.2.0")
    origins = ["http://localhost:3000", "http://127.0.0.1:3000"]
    app.add_middleware(
        CORSMiddleware, allow_origins=origins, allow_credentials=False,
        allow_methods=["GET", "POST", "PATCH", "DELETE"], allow_headers=["Content-Type"],
    )
    app.add_middleware(
        TrustedHostMiddleware, allowed_hosts=["127.0.0.1", "localhost", "[::1]", "testserver"]
    )

    @app.middleware("http")
    async def reject_cross_site_writes(request: Request, call_next):
        origin = request.headers.get("origin")
        if request.method in {"POST", "PATCH", "DELETE"} and origin:
            from urllib.parse import urlsplit
            import re
            parsed = urlsplit(origin)
            extension = parsed.scheme == "chrome-extension" and re.fullmatch("[a-p]{32}", parsed.netloc)
            if origin not in origins and not extension:
                return JSONResponse(status_code=403, content={"detail": "Origine non autorizzata."})
        return await call_next(request)

    app.state.database_path = settings.database_path
    app.state.upload_dir = settings.upload_dir
    app.state.database = service.database
    app.state.service = service
    app.mount("/uploads", StaticFiles(directory=settings.upload_dir, check_dir=False), name="uploads")

    @app.exception_handler(ListingNotFound)
    async def missing_listing(_request: Request, exc: ListingNotFound):
        return JSONResponse(status_code=404, content={"detail": str(exc)})

    @app.exception_handler(PhotoValidationError)
    async def invalid_photo(_request: Request, exc: PhotoValidationError):
        return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail})

    @app.get("/api/health")
    def health() -> dict[str, str]:
        return {"status": "ok"}

    @app.get("/api/listings", response_model=list[ListingResponse])
    def list_listings():
        return service.list()

    @app.get("/api/listings/{listing_id}", response_model=ListingResponse)
    def get_listing(listing_id: UUID):
        return service.get(str(listing_id))

    @app.patch("/api/listings/{listing_id}", response_model=ListingResponse)
    def patch_listing(listing_id: UUID, patch: ListingPatch):
        return service.update(str(listing_id), patch)

    @app.delete("/api/listings/{listing_id}", status_code=204)
    def delete_listing(listing_id: UUID) -> Response:
        service.delete(str(listing_id))
        return Response(status_code=204)

    @app.post("/api/listings", response_model=ListingResponse, status_code=201)
    async def create_listing(
        photos: list[UploadFile] = File(...), note: str = Form(...),
        item_type: str | None = Form(None), brand: str | None = Form(None),
        size: str | None = Form(None), condition: str = Form("Buone condizioni"),
        price_mode: str = Form("balanced"), explicit_price: float | None = Form(None),
    ):
        # Keep concise form errors; the domain model enforces the same rules for every caller.
        detail = None
        if not note.strip():
            detail = "note non può essere vuota."
        elif price_mode not in {"quick", "balanced", "maximize"}:
            detail = "price_mode deve essere quick, balanced oppure maximize."
        elif explicit_price is not None and explicit_price <= 0:
            detail = "explicit_price deve essere maggiore di zero."
        try:
            if detail:
                raise PhotoValidationError(status_code=422, detail=detail)
            request = ListingCreate(
                note=note, item_type=item_type, brand=brand, size=size, condition=condition,
                price_mode=price_mode, explicit_price=explicit_price,
            )
        except (ValidationError, PhotoValidationError) as exc:
            for photo in photos:
                await photo.close()
            if isinstance(exc, PhotoValidationError):
                raise
            return JSONResponse(status_code=422, content={"detail": "Dati della bozza non validi."})
        return await service.create(request, photos)

    return app


app = create_app()

"""Listing operations shared by HTTP, CLI and MCP, including photo rollback."""
from __future__ import annotations

import mimetypes
from contextlib import ExitStack
from dataclasses import replace
from pathlib import Path
from typing import Any
from uuid import UUID

from fastapi import UploadFile
from starlette.datastructures import Headers

from .barcode import detect_barcodes
from .database import Database
from .generation import generate_draft
from .images import PhotoValidationError, SUPPORTED_CONTENT_TYPES, store_uploads
from .models import ListingCreate, ListingPatch
from .settings import Settings


class ListingNotFound(ValueError):
    def __init__(self) -> None:
        super().__init__("Bozza non trovata.")


class ListingService:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self.database = Database(settings.database_path)

    def list(
        self, *, status: str | None = None, limit: int | None = None, offset: int = 0
    ) -> list[dict[str, Any]]:
        self.database.initialize()
        return self.database.list_listings(status=status, limit=limit, offset=offset)

    def get(self, listing_id: str) -> dict[str, Any]:
        self.database.initialize()
        listing = self.database.get_listing(str(UUID(listing_id)))
        if listing is None:
            raise ListingNotFound()
        return listing

    def update(self, listing_id: str, patch: ListingPatch) -> dict[str, Any]:
        self.database.initialize()
        listing = self.database.update_listing(
            str(UUID(listing_id)), patch.model_dump(exclude_unset=True)
        )
        if listing is None:
            raise ListingNotFound()
        return listing

    def delete(self, listing_id: str) -> None:
        listing = self.get(listing_id)
        paths = [(self.settings.upload_dir / Path(url).name).resolve() for url in listing["photo_urls"]]
        if any(path.parent != self.settings.upload_dir.resolve() for path in paths):
            raise ValueError("Percorso fotografia non valido.")
        if self.database.delete_listing(str(UUID(listing_id))) is None:
            raise ListingNotFound()
        for path in paths:
            path.unlink(missing_ok=True)

    async def create(self, request: ListingCreate, uploads: list[UploadFile]) -> dict[str, Any]:
        try:
            if not 1 <= len(uploads) <= 10:
                raise PhotoValidationError(status_code=422, detail="Sono consentite da 1 a 10 foto.")
            if any(photo.content_type not in SUPPORTED_CONTENT_TYPES for photo in uploads):
                raise PhotoValidationError(
                    status_code=415,
                    detail="Formato foto non supportato: usare JPG, PNG o WEBP.",
                )
            generated = generate_draft(**request.model_dump())
            photos = await store_uploads(self.settings.upload_dir, uploads)
        finally:
            for upload in uploads:
                await upload.close()
        try:
            codes = detect_barcodes([self.settings.upload_dir / photo.filename for photo in photos])
            if codes:
                generated = replace(
                    generated,
                    description=f"{generated.description}\n\nISBN / codice rilevato: {', '.join(codes)}.",
                )
            self.database.initialize()
            return self.database.create_listing(
                **request.model_dump(exclude={"condition"}), generated=generated, photos=photos
            )
        except BaseException:
            for photo in photos:
                (self.settings.upload_dir / photo.filename).unlink(missing_ok=True)
            raise

    async def create_from_paths(
        self, request: ListingCreate, paths: list[Path], *, allowed_root: Path | None = None
    ) -> dict[str, Any]:
        if not 1 <= len(paths) <= 10:
            raise ValueError("Sono consentite da 1 a 10 foto.")
        resolved = []
        for path in paths:
            if str(path).startswith(("\\\\", "//")):
                raise ValueError("Sono consentiti soltanto percorsi locali.")
            path = path.expanduser().resolve(strict=True)
            if allowed_root is not None and not path.is_relative_to(allowed_root.resolve()):
                raise ValueError("Foto fuori dalla cartella di importazione autorizzata.")
            if not path.is_file():
                raise ValueError("Il percorso deve indicare una fotografia locale.")
            resolved.append(path)
        with ExitStack() as stack:
            uploads = [
                UploadFile(
                    stack.enter_context(path.open("rb")),
                    filename=path.name,
                    headers=Headers({"content-type": mimetypes.guess_type(path.name)[0] or "application/octet-stream"}),
                )
                for path in resolved
            ]
            return await self.create(request, uploads)

    def transfer(self, listing_id: str) -> dict[str, Any]:
        listing = self.get(listing_id)
        return {
            "listing": listing,
            "vinted_url": f"https://www.vinted.it/items/new#vinted-assistant={listing['id']}",
            "dashboard_url": "http://127.0.0.1:3000",
            "requires_running_dashboard_and_extension": True,
            "checklist": [
                "Avvia l'app locale e abilita Vinted Assistant Bridge in Chrome.",
                "Apri vinted_url e premi Compila campi e foto nel pannello.",
                "Verifica le anteprime reali e completa i selettori richiesti.",
                "Salva la bozza su Vinted e verifica Profilo > Bozze prima di registrare lo stato.",
                "La pubblicazione sul sito richiede un'azione manuale dell'utente.",
            ],
        }

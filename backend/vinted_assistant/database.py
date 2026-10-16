import sqlite3
from contextlib import contextmanager
from collections.abc import Iterator
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from uuid import uuid4

from .generation import GeneratedDraft
from .images import StoredPhoto
from .models import ListingPatch


_SCHEMA = """
CREATE TABLE IF NOT EXISTS listings (
    id TEXT PRIMARY KEY,
    note TEXT NOT NULL,
    item_type TEXT,
    brand TEXT,
    size TEXT,
    condition TEXT NOT NULL,
    price_mode TEXT NOT NULL,
    explicit_price_cents INTEGER,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    category TEXT NOT NULL,
    price_cents INTEGER NOT NULL,
    parcel_size TEXT NOT NULL,
    status TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS photos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    listing_id TEXT NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
    filename TEXT NOT NULL UNIQUE,
    content_type TEXT NOT NULL,
    position INTEGER NOT NULL
);
"""


class Database:
    def __init__(self, path: Path) -> None:
        self.path = Path(path)

    @contextmanager
    def _connect(self) -> Iterator[sqlite3.Connection]:
        connection = sqlite3.connect(self.path, timeout=10)
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA foreign_keys = ON")
        try:
            with connection:
                yield connection
        finally:
            connection.close()

    def initialize(self) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with self._connect() as connection:
            connection.executescript(_SCHEMA)

    @staticmethod
    def _serialize_listing(
        connection: sqlite3.Connection,
        row: sqlite3.Row,
    ) -> dict[str, Any]:
        photos = connection.execute(
            """
            SELECT filename FROM photos
            WHERE listing_id = ?
            ORDER BY position ASC
            """,
            (row["id"],),
        ).fetchall()
        return {
            "id": row["id"],
            "photo_urls": [f"/uploads/{photo['filename']}" for photo in photos],
            "item_type": row["item_type"],
            "brand": row["brand"],
            "size": row["size"],
            "title": row["title"],
            "description": row["description"],
            "category": row["category"],
            "condition": row["condition"],
            "price": row["price_cents"] / 100,
            "parcel_size": row["parcel_size"],
            "status": row["status"],
            "created_at": row["created_at"],
            "updated_at": row["updated_at"],
        }

    def list_listings(
        self, *, status: str | None = None, limit: int | None = None, offset: int = 0
    ) -> list[dict[str, Any]]:
        query = "SELECT * FROM listings"
        params: list[Any] = []
        if status is not None:
            query += " WHERE status = ?"
            params.append(status)
        query += " ORDER BY created_at DESC, rowid DESC"
        if limit is not None:
            query += " LIMIT ? OFFSET ?"
            params.extend((limit, offset))
        with self._connect() as connection:
            rows = connection.execute(query, params).fetchall()
            return [self._serialize_listing(connection, row) for row in rows]

    def get_listing(self, listing_id: str) -> dict[str, Any] | None:
        with self._connect() as connection:
            row = connection.execute(
                "SELECT * FROM listings WHERE id = ?",
                (listing_id,),
            ).fetchone()
            if row is None:
                return None
            return self._serialize_listing(connection, row)

    def delete_listing(self, listing_id: str) -> list[str] | None:
        with self._connect() as connection:
            exists = connection.execute(
                "SELECT 1 FROM listings WHERE id = ?",
                (listing_id,),
            ).fetchone()
            if exists is None:
                return None
            photos = connection.execute(
                "SELECT filename FROM photos WHERE listing_id = ?",
                (listing_id,),
            ).fetchall()
            connection.execute("DELETE FROM listings WHERE id = ?", (listing_id,))
            return [row["filename"] for row in photos]

    def update_listing(
        self,
        listing_id: str,
        updates: dict[str, Any],
    ) -> dict[str, Any] | None:
        updates = ListingPatch.model_validate(updates).model_dump(exclude_unset=True)
        if not updates:
            return self.get_listing(listing_id)

        columns: list[str] = []
        values: list[Any] = []
        for field, value in updates.items():
            if field == "price":
                columns.append("price_cents = ?")
                values.append(round(value * 100))
            else:
                columns.append(f"{field} = ?")
                values.append(value)

        timestamp = datetime.now(timezone.utc).isoformat()
        columns.append("updated_at = ?")
        values.extend((timestamp, listing_id))
        with self._connect() as connection:
            cursor = connection.execute(
                f"UPDATE listings SET {', '.join(columns)} WHERE id = ?",
                values,
            )
            if cursor.rowcount == 0:
                return None
            row = connection.execute(
                "SELECT * FROM listings WHERE id = ?",
                (listing_id,),
            ).fetchone()
            return self._serialize_listing(connection, row)

    def create_listing(
        self,
        *,
        note: str,
        item_type: str | None,
        brand: str | None,
        size: str | None,
        price_mode: str,
        explicit_price: float | None,
        generated: GeneratedDraft,
        photos: list[StoredPhoto],
    ) -> dict[str, Any]:
        listing_id = str(uuid4())
        timestamp = datetime.now(timezone.utc).isoformat()
        explicit_price_cents = (
            round(explicit_price * 100) if explicit_price is not None else None
        )
        price_cents = round(generated.price * 100)

        with self._connect() as connection:
            connection.execute(
                """
                INSERT INTO listings (
                    id, note, item_type, brand, size, condition, price_mode,
                    explicit_price_cents, title, description, category,
                    price_cents, parcel_size, status, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    listing_id,
                    note,
                    item_type,
                    brand,
                    size,
                    generated.condition,
                    price_mode,
                    explicit_price_cents,
                    generated.title,
                    generated.description,
                    generated.category,
                    price_cents,
                    generated.parcel_size,
                    "ready",
                    timestamp,
                    timestamp,
                ),
            )
            connection.executemany(
                """
                INSERT INTO photos (listing_id, filename, content_type, position)
                VALUES (?, ?, ?, ?)
                """,
                [
                    (listing_id, photo.filename, photo.content_type, position)
                    for position, photo in enumerate(photos)
                ],
            )

        return {
            "id": listing_id,
            "photo_urls": [f"/uploads/{photo.filename}" for photo in photos],
            "item_type": item_type,
            "brand": brand,
            "size": size,
            "title": generated.title,
            "description": generated.description,
            "category": generated.category,
            "condition": generated.condition,
            "price": price_cents / 100,
            "parcel_size": generated.parcel_size,
            "status": "ready",
            "created_at": timestamp,
            "updated_at": timestamp,
        }

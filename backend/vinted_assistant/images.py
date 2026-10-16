import warnings
from dataclasses import dataclass
from io import BytesIO
from pathlib import Path
from uuid import uuid4

from fastapi import UploadFile
from PIL import Image, UnidentifiedImageError


_CONTENT_TYPE_EXTENSIONS = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
}
_FORMAT_CONTENT_TYPES = {
    "JPEG": "image/jpeg",
    "PNG": "image/png",
    "WEBP": "image/webp",
}
SUPPORTED_CONTENT_TYPES = frozenset(_CONTENT_TYPE_EXTENSIONS)
MAX_PHOTO_BYTES = 10 * 1024 * 1024


class PhotoValidationError(ValueError):
    def __init__(self, *, status_code: int, detail: str) -> None:
        super().__init__(detail)
        self.status_code = status_code
        self.detail = detail


@dataclass(frozen=True)
class StoredPhoto:
    filename: str
    content_type: str


async def store_uploads(upload_dir: Path, uploads: list[UploadFile]) -> list[StoredPhoto]:
    pending: list[tuple[str, str, bytes]] = []
    stored: list[StoredPhoto] = []
    try:
        for upload in uploads:
            content_type = upload.content_type or "application/octet-stream"
            data = await upload.read(MAX_PHOTO_BYTES + 1)
            if len(data) > MAX_PHOTO_BYTES:
                raise PhotoValidationError(
                    status_code=413,
                    detail="Ogni foto deve essere al massimo di 10 MB.",
                )
            try:
                with warnings.catch_warnings():
                    warnings.simplefilter("error", Image.DecompressionBombWarning)
                    with Image.open(BytesIO(data)) as image:
                        actual_content_type = _FORMAT_CONTENT_TYPES.get(image.format or "")
                        if image.width * image.height > 25_000_000:
                            raise ValueError("Immagine oltre 25 megapixel.")
                        image.verify()
            except (UnidentifiedImageError, OSError, ValueError,
                    Image.DecompressionBombError, Image.DecompressionBombWarning) as exc:
                raise PhotoValidationError(
                    status_code=415,
                    detail="Il file caricato non è un'immagine valida.",
                ) from exc
            if actual_content_type != content_type:
                raise PhotoValidationError(
                    status_code=415,
                    detail="Il tipo dichiarato non corrisponde alla foto.",
                )

            extension = _CONTENT_TYPE_EXTENSIONS.get(content_type, ".bin")
            filename = f"{uuid4().hex}{extension}"
            pending.append((filename, content_type, data))

        upload_dir.mkdir(parents=True, exist_ok=True)
        for filename, content_type, data in pending:
            (upload_dir / filename).write_bytes(data)
            stored.append(StoredPhoto(filename=filename, content_type=content_type))
    except Exception:
        for photo in stored:
            (upload_dir / photo.filename).unlink(missing_ok=True)
        raise
    finally:
        for upload in uploads:
            await upload.close()
    return stored

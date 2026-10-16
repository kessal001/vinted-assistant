import importlib
from pathlib import Path

from PIL import Image, UnidentifiedImageError


def detect_barcodes(photo_paths: list[Path]) -> list[str]:
    """Decode barcodes when pyzbar and its native runtime are available.

    Barcode support is optional: missing Python/native dependencies or an unreadable
    image simply produce no codes so listing creation remains fully offline and usable.
    """
    try:
        decoder = importlib.import_module("pyzbar.pyzbar")
    except (ImportError, ModuleNotFoundError, OSError):
        return []

    values: list[str] = []
    seen: set[str] = set()
    for path in photo_paths:
        try:
            with Image.open(path) as image:
                decoded_items = decoder.decode(image)
        except (OSError, UnidentifiedImageError, ValueError):
            continue

        for item in decoded_items:
            raw = getattr(item, "data", b"")
            if isinstance(raw, bytes):
                value = raw.decode("utf-8", errors="ignore").strip()
            else:
                value = str(raw).strip()
            if value and value not in seen:
                seen.add(value)
                values.append(value)
    return values

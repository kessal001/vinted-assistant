from io import BytesIO

from PIL import Image


def make_image_bytes(image_format: str = "JPEG", size: tuple[int, int] = (8, 8)) -> bytes:
    buffer = BytesIO()
    Image.new("RGB", size, color=(25, 100, 180)).save(buffer, format=image_format)
    return buffer.getvalue()

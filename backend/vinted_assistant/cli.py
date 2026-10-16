import argparse
import asyncio
import json
from pathlib import Path
from typing import Sequence

from pydantic import ValidationError

from .images import PhotoValidationError
from .models import ListingCreate, ListingResponse
from .service import ListingService
from .settings import Settings


def _parser() -> argparse.ArgumentParser:
    settings = Settings.from_env()
    parser = argparse.ArgumentParser(prog="vinted-assistant", description="Crea bozze locali dalle foto.")
    commands = parser.add_subparsers(dest="command", required=True)
    add = commands.add_parser("add", help="Aggiunge una bozza alla coda locale")
    add.add_argument("--photo", action="append", required=True, type=Path)
    add.add_argument("--note", required=True)
    add.add_argument("--item-type")
    add.add_argument("--brand")
    add.add_argument("--size")
    add.add_argument("--condition", default="Buone condizioni")
    add.add_argument("--price-mode", choices=["quick", "balanced", "maximize"], default="balanced")
    add.add_argument("--explicit-price", type=float)
    add.add_argument("--database", type=Path, default=settings.database_path)
    add.add_argument("--uploads", type=Path, default=settings.upload_dir)
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    args = _parser().parse_args(argv)
    try:
        request = ListingCreate(
            note=args.note, item_type=args.item_type, brand=args.brand, size=args.size,
            condition=args.condition, price_mode=args.price_mode, explicit_price=args.explicit_price,
        )
        service = ListingService(Settings(args.database, args.uploads))
        listing = asyncio.run(service.create_from_paths(request, args.photo))
    except (ValidationError, PhotoValidationError, ValueError, OSError) as exc:
        raise SystemExit(str(exc)) from exc
    payload = ListingResponse.model_validate(listing).model_dump(mode="json")
    print(json.dumps(payload, ensure_ascii=False))
    return 0


def entrypoint() -> None:
    raise SystemExit(main())


if __name__ == "__main__":
    entrypoint()

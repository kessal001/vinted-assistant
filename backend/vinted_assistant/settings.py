"""One data location for the HTTP app, CLI and MCP server."""
import os
from dataclasses import dataclass
from pathlib import Path


def default_data_dir() -> Path:
    configured = os.environ.get("VINTED_ASSISTANT_DATA_DIR")
    if configured:
        return Path(configured).expanduser().resolve()
    backend = Path(__file__).resolve().parent.parent
    if (backend / "pyproject.toml").is_file():
        return backend / "data"
    if os.name == "nt":
        base = Path(os.environ.get("LOCALAPPDATA", Path.home() / "AppData" / "Local"))
    else:
        base = Path(os.environ.get("XDG_DATA_HOME", Path.home() / ".local" / "share"))
    return base / "vinted-assistant"


@dataclass(frozen=True)
class Settings:
    database_path: Path
    upload_dir: Path

    @classmethod
    def from_env(cls) -> "Settings":
        data = default_data_dir()
        return cls(data / "vinted.db", data / "uploads")

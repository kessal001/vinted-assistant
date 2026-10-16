"""Verify tracked sources and make a ZIP from the Git index, without local data."""
import argparse
import hashlib
import re
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SECRET = re.compile(rb"(?:ghp_|gho_|github_pat_|sk-proj-)[A-Za-z0-9_]{20,}")


def tracked_sources() -> list[str]:
    raw = subprocess.check_output(["git", "ls-files", "-z"], cwd=ROOT)
    paths = [path for path in raw.decode("utf-8").split("\0") if path]
    if not paths:
        raise RuntimeError("Aggiungi prima i sorgenti all'indice Git.")
    for name in paths:
        path = Path(name)
        if (
            (name.startswith("backend/data/") and name != "backend/data/.gitkeep")
            or any(part in {".git", "node_modules", ".next", "__pycache__"}
                   or part.startswith((".venv", ".qa-")) for part in path.parts)
            or (path.name.startswith(".env") and path.name != ".env.example")
            or path.suffix.lower() in {".db", ".sqlite", ".pem", ".key", ".pfx", ".p12"}
            or (ROOT / path).is_symlink()
        ):
            raise RuntimeError(f"File privato o generato nell'indice: {name}")
        content = subprocess.check_output(["git", "show", f":{name}"], cwd=ROOT)
        if SECRET.search(content):
            raise RuntimeError(f"Possibile segreto nel file: {name}")
    return paths


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--verify-only", action="store_true")
    parser.add_argument("--output", type=Path, default=ROOT / "artifacts" / "vinted-assistant-0.2.0-source.zip")
    args = parser.parse_args()
    paths = tracked_sources()
    tree = subprocess.check_output(["git", "write-tree"], cwd=ROOT).decode().strip()
    print(f"Verified {len(paths)} tracked files; tree {tree}")
    if not args.verify_only:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        subprocess.run(
            ["git", "archive", "--format=zip", "--prefix=vinted-assistant/",
             "-o", str(args.output.resolve()), tree], cwd=ROOT, check=True,
        )
        digest = hashlib.sha256(args.output.read_bytes()).hexdigest()
        print(f"{args.output.resolve()}\nSHA256 {digest}")


if __name__ == "__main__":
    main()

from __future__ import annotations

import argparse
import os
import socket
import subprocess
import sys
import time
import urllib.error
import urllib.request
import webbrowser
from pathlib import Path

ROOT = Path(__file__).resolve().parent
BACKEND_DIR = ROOT / "backend"
FRONTEND_DIR = ROOT / "frontend"
BACKEND_PYTHON = BACKEND_DIR / ".venv" / ("Scripts/python.exe" if os.name == "nt" else "bin/python")


def wait_for_url(url: str, timeout: float = 30.0) -> None:
    deadline = time.monotonic() + timeout
    last_error: Exception | None = None
    while time.monotonic() < deadline:
        try:
            with urllib.request.urlopen(url, timeout=2) as response:
                if 200 <= response.status < 300:
                    return
        except (urllib.error.URLError, TimeoutError, ConnectionError) as error:
            last_error = error
        time.sleep(0.25)
    raise RuntimeError(f"Timeout durante l'avvio di {url}: {last_error}")


def stop_process(process: subprocess.Popen[bytes]) -> None:
    if process.poll() is not None:
        return
    if os.name == "nt":
        subprocess.run(
            ["taskkill.exe", "/PID", str(process.pid), "/T", "/F"],
            capture_output=True,
            check=False,
        )
        try:
            process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            process.kill()
            process.wait(timeout=5)
        return
    process.terminate()
    try:
        process.wait(timeout=5)
    except subprocess.TimeoutExpired:
        process.kill()
        process.wait(timeout=5)


def build_commands(*, dev: bool = False) -> tuple[list[str], list[str]]:
    backend = [
        str(BACKEND_PYTHON),
        "-m",
        "uvicorn",
        "vinted_assistant.app:app",
        "--host",
        "127.0.0.1",
        "--port",
        "8000",
    ]
    frontend = [
        "node",
        str(FRONTEND_DIR / "node_modules" / "next" / "dist" / "bin" / "next"),
        "dev" if dev else "start",
        "--hostname",
        "127.0.0.1",
        "--port",
        "3000",
    ]
    return backend, frontend


def validate_installation(*, dev: bool = False) -> None:
    missing: list[str] = []
    if not BACKEND_PYTHON.exists():
        missing.append("backend/.venv")
    if not (FRONTEND_DIR / "node_modules").exists():
        missing.append("frontend/node_modules")
    if not dev and not (FRONTEND_DIR / ".next" / "BUILD_ID").is_file():
        missing.append("frontend/.next (npm run build)")
    if missing:
        joined = ", ".join(missing)
        raise RuntimeError(
            f"Dipendenze mancanti: {joined}. Esegui setup-vinted-assistant.bat."
        )


def run(*, open_browser: bool, check_only: bool, dev: bool = False) -> int:
    validate_installation(dev=dev)
    for port in (8000, 3000):
        with socket.socket() as probe:
            try:
                probe.bind(("127.0.0.1", port))
            except OSError as exc:
                raise RuntimeError(f"Porta {port} gia in uso; ferma l'istanza esistente.") from exc
    backend_command, frontend_command = build_commands(dev=dev)
    processes: list[subprocess.Popen[bytes]] = []

    try:
        print("Avvio API locale su http://127.0.0.1:8000 ...", flush=True)
        processes.append(subprocess.Popen(backend_command, cwd=BACKEND_DIR))
        print("Avvio dashboard su http://127.0.0.1:3000 ...", flush=True)
        processes.append(subprocess.Popen(frontend_command, cwd=FRONTEND_DIR))

        wait_for_url("http://127.0.0.1:8000/api/health")
        wait_for_url("http://127.0.0.1:3000")
        print("Vinted Assistant è pronto.", flush=True)

        if open_browser:
            webbrowser.open("http://127.0.0.1:3000")
        if check_only:
            return 0

        print("Lascia aperta questa finestra. Premi Ctrl+C per fermare l'app.")
        while True:
            for process in processes:
                code = process.poll()
                if code is not None:
                    raise RuntimeError(
                        f"Un servizio si è chiuso inaspettatamente (codice {code})."
                    )
            time.sleep(0.5)
    except KeyboardInterrupt:
        print("\nArresto di Vinted Assistant...")
        return 0
    finally:
        for process in reversed(processes):
            stop_process(process)


def main() -> int:
    parser = argparse.ArgumentParser(description="Avvia Vinted Assistant in locale")
    parser.add_argument(
        "--no-browser",
        action="store_true",
        help="non aprire automaticamente il browser",
    )
    parser.add_argument(
        "--check",
        action="store_true",
        help="verifica l'avvio e arresta subito entrambi i servizi",
    )
    parser.add_argument("--dev", action="store_true", help="usa Next.js dev invece della build di produzione")
    args = parser.parse_args()

    try:
        return run(open_browser=not args.no_browser, check_only=args.check, dev=args.dev)
    except RuntimeError as error:
        print(f"Errore: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())

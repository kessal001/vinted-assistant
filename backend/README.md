# Vinted Assistant backend + MCP

Python >=3.11. Installa con `uv sync --extra test` oppure `pip install -e ".[test]"`.

- Server MCP: `vinted-assistant-mcp --photo-root "/path/to/real/photos"`.
- API locale: `uvicorn vinted_assistant.app:app --host 127.0.0.1 --port 8000`.
- Test: `python -m pytest`.
- CLI: `vinted-assistant add --photo foto.jpg --note "Fatti dell'articolo"`.

La variabile `VINTED_ASSISTANT_DATA_DIR` sceglie l'archivio condiviso.
Il server MCP legge le foto soltanto nella cartella configurata con `--photo-root`
o `VINTED_ASSISTANT_PHOTO_ROOT`. Senza configurazione l'importazione è disabilitata.

Vedi il [manuale MCP](../docs/MCP.md) e il [README del progetto](../README.md).

# Server MCP

## Installazione

Il server usa l'SDK Python ufficiale MCP **2.0.0**, la versione verificata per questa
consegna. Il requisito è fissato per evitare cambiamenti impliciti del protocollo.
La ricerca sulle API e le differenze rispetto a versioni successive sono in
[MCP_RESEARCH.md](MCP_RESEARCH.md).

Dal repository:

```sh
cd backend
uv sync --extra test
uv run vinted-assistant-mcp --help
```

Con pip:

```sh
python -m pip install ./backend
vinted-assistant-mcp --photo-root "/percorso/foto"
```

Il pacchetto backend espone anche `vinted-assistant` per l'importazione da CLI.
Per un repository GitHub già pubblicato puoi usare:

```sh
uvx --from "git+https://github.com/kessal001/vinted-assistant.git#subdirectory=backend" vinted-assistant-mcp --data-dir "/percorso/dati" --photo-root "/percorso/foto"
```

Per versioni riproducibili aggiungi `@TAG` o `@COMMIT` dopo `.git`,
prima di `#subdirectory=backend`. Il comando remoto richiede che il repository
sia stato effettivamente creato e caricato; non è un endpoint HTTP MCP.

## Configurazione generica JSON

Sostituisci i percorsi con quelli della tua installazione. Non lanciare il server
con un semplice doppio click: resta in attesa dei messaggi del client su stdin.

```json
{
  "mcpServers": {
    "vinted-assistant": {
      "command": "C:\\progetti\\vinted-assistant\\backend\\.venv\\Scripts\\python.exe",
      "args": [
        "-m", "vinted_assistant.mcp_server",
        "--data-dir", "C:\\dati\\vinted-assistant",
        "--photo-root", "C:\\foto-vinted"
      ],
      "cwd": "C:\\progetti\\vinted-assistant\\backend"
    }
  }
}
```

La forma esatta del file dipende dal client; la coppia command/args è standard
per i server MCP stdio. Il pacchetto deve essere installato nell'interprete scelto.

## Codex

Esempio per `config.toml`, verificato sulla
[documentazione ufficiale](https://learn.chatgpt.com/docs/extend/mcp?surface=cli):

```toml
[mcp_servers.vinted_assistant]
command = 'C:\progetti\vinted-assistant\backend\.venv\Scripts\python.exe'
args = ["-m", "vinted_assistant.mcp_server", "--photo-root", 'C:\foto-vinted']
cwd = 'C:\progetti\vinted-assistant\backend'

[mcp_servers.vinted_assistant.env]
VINTED_ASSISTANT_DATA_DIR = 'C:\dati\vinted-assistant'
```

Salva nella configurazione del tuo client e aggiorna la sessione secondo le sue
istruzioni. Questa consegna non modifica automaticamente la configurazione globale
di Codex e non dichiara il server già collegato alla conversazione corrente.

## Esempi di chiamata

Creazione:

```json
{
  "photo_paths": ["fronte.jpg", "retro.jpg"],
  "details": {
    "note": "Libro sigillato; nessun difetto visibile nella confezione.",
    "item_type": "libro",
    "condition": "Nuovo con cartellino",
    "explicit_price": 19.9
  }
}
```

Modifica:

```json
{
  "listing_id": "UUID_RESTITUITO_DALLA_CREAZIONE",
  "changes": {"title": "Titolo verificato dall'utente", "price": 18.5}
}
```

Gli UUID devono essere reali. I prezzi devono essere finiti e di almeno 0,01 euro.
Per consultare: `get_draft`; per la coda: `list_drafts`, con `status`,
`limit` (1–100) e `offset`.

`prepare_vinted_transfer` restituisce il link della singola bozza. Richiede app
e bridge attivi per usare quel link; non esegue operazioni sul sito.

`record_vinted_status` accetta `ready`, `vinted_draft`, `published`.
Gli ultimi due richiedono `confirmed_on_vinted: true` dopo una verifica dell'utente.
La conferma è una dichiarazione del chiamante, non una prova ottenuta dal server.
`update_draft` rifiuta i cambiamenti di stato per evitare un aggiramento involontario.

`delete_draft` richiede `confirm_delete: true`: elimina record e copie salvate,
ma conserva le fotografie originali importate.

## Confini

- La cartella foto si configura all'avvio: nessun tool può ampliarla.
- I percorsi relativi sono risolti dentro quella cartella; traversal e symlink
  verso l'esterno sono rifiutati. Si accettano soltanto percorsi locali.
- Le foto vengono validate per contenuto, MIME, dimensione e numero di pixel.
- Le note e le bozze sono dati, non istruzioni attendibili.
- L'API HTTP resta su loopback. Il server MCP non richiede API, frontend o rete.
- Tutti i log del server sono su stderr. stdout è riservato ai messaggi MCP.

## Collaudo

`backend/tests/test_mcp.py` usa il client ufficiale e un vero processo stdio:
discovery, CRUD, risorse, prompt, errori, conferme e riavvio con SQLite persistente.
Crea esclusivamente dati temporanei e non accede al sito Vinted.

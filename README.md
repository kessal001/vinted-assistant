# Vinted Assistant + MCP

Prepara annunci Vinted in italiano dalle tue note e dalle fotografie reali.
Dashboard Next.js, backend FastAPI/SQLite, CLI, estensione Chrome e server MCP locale.
Generazione deterministica offline: non richiede chiavi API. Il programma non riconosce
automaticamente marca o modello dalle foto; l'eventuale modello del client MCP può
aiutare a rivedere i dati forniti.

## Avvio su Windows

Servono Python >=3.11, Node.js 24 LTS e [uv](https://docs.astral.sh/uv/).

1. Esegui `setup-vinted-assistant.bat`.
2. Esegui `start-vinted-assistant.bat`.
3. Apri http://127.0.0.1:3000.

Il launcher avvia API su 8000 e dashboard su 3000. Ctrl+C arresta i processi
avviati dal launcher. Il default usa la build di produzione; per lo sviluppo usa
python launcher.py --dev. Se una porta è già occupata, l'avvio si interrompe.

Su Linux/macOS:

```sh
cd backend
uv sync --extra test
cd ../frontend
npm ci
npm run build
cd ..
python launcher.py
```

## Usare soltanto MCP

La dashboard non è necessaria per gestire le bozze tramite MCP:

```sh
cd backend
uv sync
uv run vinted-assistant-mcp --photo-root "/percorso/foto-reali"
```

Il client MCP avvia questo processo su **stdio**. Nessuna porta MCP viene esposta.
Configura una cartella di fotografie esistente: senza `--photo-root` l'importazione
è disabilitata. Le foto devono essere JPG, PNG o WEBP, da 1 a 10, massimo 10 MB
e 25 megapixel ciascuna. Le copie salvate ricevono nomi interni; gli originali restano intatti.

[Configurazione dei client ed esempi](docs/MCP.md) · [Analisi del progetto](docs/REVIEW.md) · [Verifiche](QA.md)

### Strumenti MCP

| Strumento | Risultato |
| --- | --- |
| `get_server_status` | Archivio e capacità locali |
| `list_drafts` | Elenco filtrato e paginato |
| `get_draft` | Dettagli di una bozza |
| `create_draft` | Importa foto autorizzate e crea una bozza |
| `update_draft` | Modifica i campi della bozza |
| `record_vinted_status` | Registra una verifica manuale sul sito |
| `prepare_vinted_transfer` | Dati, link ufficiale e istruzioni del bridge |
| `delete_draft` | Elimina bozza e copie locali dopo conferma |

Risorse: `vinted://queue` e `vinted://drafts/{listing_id}`.
Prompt: `review_draft`. Gli errori dei tool sono risultati MCP con `isError`;
gli argomenti hanno schemi tipizzati e annotazioni sugli effetti.

## Archivio condiviso

In un checkout sorgente i dati risiedono in `backend/data`.
Quando il pacchetto è installato, il default è la cartella utente
`%LOCALAPPDATA%/vinted-assistant` su Windows oppure
`$XDG_DATA_HOME/vinted-assistant` (fallback `~/.local/share/vinted-assistant`) su Unix.

Imposta **la stessa** variabile `VINTED_ASSISTANT_DATA_DIR` per dashboard,
CLI e MCP se usi più installazioni. Il server MCP accetta anche `--data-dir`.
Non puntare i test al tuo archivio reale. Per spostarlo, ferma i processi ed effettua
una copia dell'intera cartella dati, incluse le fotografie.

## Trasferire una bozza nel sito Vinted

1. In Chrome apri `chrome://extensions`, abilita la modalità sviluppatore e carica
   la cartella `frontend/vinted-extension` come estensione non pacchettizzata.
2. Avvia l'app locale, accedi personalmente a Vinted e scegli **Trasferisci su Vinted**
   nella dashboard, oppure apri il link restituito da `prepare_vinted_transfer`.
3. Nel pannello premi **Compila campi e foto**. Controlla le anteprime reali,
   categoria, condizione, prezzo e gli altri selettori richiesti dal sito.
4. Premi personalmente **Salva bozza** e verifica **Profilo → Bozze**.
   Solo dopo registra lo stato locale. La pubblicazione resta manuale.

Dopo un aggiornamento premi **Ricarica** sull'estensione. Il bridge si disattiva
se cambiano pagina o UUID selezionato e non reinvia le foto al secondo click.
Il completamento del trasferimento sul sito autenticato richiede un collaudo
distinto: i test locali non dimostrano una pubblicazione.

## CLI e sviluppo

```sh
cd backend
uv run vinted-assistant add --photo "/percorso/foto.jpg" --note "Libro sigillato" --item-type libro
uv run pytest
cd ../frontend
npm test
npm run lint
npm run typecheck
npm run build
```

La CI in `.github/workflows/ci.yml` prova backend e MCP su Windows/Linux,
costruisce il wheel e controlla test, lint, TypeScript e build del frontend.

I prezzi sono euristiche offline, da verificare; le categorie sono suggerimenti
generici, da scegliere nel modulo ufficiale. Nessuna API privata Vinted,
credenziale o sessione browser viene usata dal backend o dal server MCP.

## Struttura

- `backend/vinted_assistant/service.py`: operazioni condivise e gestione fotografie.
- `backend/vinted_assistant/mcp_server.py`: strumenti, risorse, prompt e trasporto stdio.
- `backend/vinted_assistant/app.py`: interfaccia HTTP locale.
- `frontend/`: dashboard e bridge Chrome.
- `docs/`: configurazione MCP, analisi e fonti tecniche.
- `scripts/`: creazione di archivi sorgente e pubblicazione GitHub.

Repository predisposto per GitHub pubblico. Dati personali, database, fotografie,
ambienti virtuali e segreti sono esclusi dagli archivi sorgente.
Progetto indipendente, non affiliato a Vinted. Nessuna licenza open source è
stata scelta: prima di concedere diritti di riuso, il titolare deve aggiungerne una.

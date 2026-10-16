# Ricerca MCP per Vinted Assistant

Verifica delle fonti ufficiali: 15 ottobre 2026. Questo documento distingue le API confermate dalle scelte proposte per il progetto. Gli esempi sono indicativi: il collaudo dell'implementazione va registrato separatamente.

## Versione e dipendenze

La release stabile corrente pubblicata su PyPI è **mcp 2.3.0**, del 2 ottobre 2026, con Python >=3.10. Questo dato descrive la versione upstream; non implica che sia installata o collaudata in questa consegna. [PyPI MCP 2.3.0](https://pypi.org/project/mcp/2.3.0/)

La versione disponibile per il collaudo locale è **mcp 2.0.0**, confermata dal manifest installato e dall'ispezione del codice. È una release stabile del 28 luglio 2026, compatibile con Python >=3.10; il progetto richiede già Python >=3.11. Il manifest finale fissa `mcp==2.0.0` per riprodurre il collaudo disponibile. Il vecchio uv.lock e stato rimosso perche non includeva MCP; la risoluzione completa a freddo richiede rete. L'ispezione statica non sostituisce la suite del progetto e i risultati runtime vanno registrati nel rapporto QA. Non serve l'extra `cli` per un proprio entry point. [PyPI MCP 2.0.0](https://pypi.org/project/mcp/2.0.0/), [release ufficiale 2.0.0](https://github.com/modelcontextprotocol/python-sdk/releases/tag/v2.0.0)

In v2 la classe server è `MCPServer`; il vecchio import `mcp.server.fastmcp.FastMCP` non esiste. I campi Python sono snake_case: `structured_content`, `is_error`, `input_schema`, `mime_type`; il protocollo JSON mantiene i nomi camelCase. Evitare un'integrazione che combini import v1 e dipendenze v2. [Guida ufficiale di migrazione](https://py.sdk.modelcontextprotocol.io/migration/)

Il manifest del tag 2.0.0 richiede anche Pydantic >=2.12 e include dipendenze proprie per il trasporto. Verificare la risoluzione assieme a FastAPI e ai test HTTP esistenti; non eliminare `httpx` se i test REST lo usano, dato che il nuovo SDK usa `httpx2`. [Manifest ufficiale 2.0.0](https://github.com/modelcontextprotocol/python-sdk/blob/v2.0.0/pyproject.toml)

## Server e primitive

`MCPServer` accetta nome, versione e istruzioni esplicite. `run(transport="stdio")` è sincrono e avvia il trasporto locale. I decorator `tool`, `resource` e `prompt` rimangono disponibili. Il codice del tag conferma anche `annotations=` e `structured_output=` per i tool. [Implementazione ufficiale MCPServer 2.0.0](https://github.com/modelcontextprotocol/python-sdk/blob/v2.0.0/src/mcp/server/mcpserver/server.py)

Esempio autonomo per chiarire la superficie API, senza dipendere da FastAPI:

```python
from mcp.server import MCPServer
from mcp.types import ToolAnnotations

server = MCPServer("Vinted Assistant", version="0.2.0")

@server.tool(annotations=ToolAnnotations(read_only_hint=True, open_world_hint=False))
def describe_storage() -> dict[str, str]:
    """Describe the local data store."""
    return {"database": "SQLite", "scope": "local drafts"}

if __name__ == "__main__":
    server.run(transport="stdio")
```

La firma tipizzata dei tool genera lo schema degli argomenti. `Annotated` con `Field` e `Literal` consente limiti, descrizioni ed enum. Sono quindi adatti modelli Pydantic del dominio e limiti espliciti a quantità, paginazione e lunghezza dei testi. I risultati Python tipizzati possono produrre contenuto strutturato. [Documentazione ufficiale tool](https://py.sdk.modelcontextprotocol.io/servers/tools/)

Le risorse sono adatte a dati di contesto: per esempio capacità del server e bozze salvate. Un URI con placeholder crea una risorsa parametrica che compare in `resources/templates/list`, anziché nell'elenco delle risorse statiche. Il parametro della funzione deve corrispondere al placeholder. Dichiarare `mime_type="application/json"` per dati JSON. [Documentazione ufficiale risorse](https://py.sdk.modelcontextprotocol.io/servers/resources/)

Un prompt registrato con `@server.prompt()` può restituire testo e accettare argomenti stringa. È adatto a fornire istruzioni per descrivere l'articolo e rivedere la bozza senza inventare dettagli. Un prompt da solo non esegue un modello AI né necessita di una chiave API. [Documentazione ufficiale prompt](https://py.sdk.modelcontextprotocol.io/servers/prompts/)

## Trasporto e architettura proposta

Il trasporto stdio fa avviare il processo server al client e scambia messaggi JSON-RPC su stdin/stdout. **stdout deve contenere soltanto messaggi MCP**; i log vanno su stderr. Non inserire banner, `print()` diagnostici o output della normale CLI nel percorso di avvio MCP. [Specifica ufficiale trasporti 2025-11-25](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports#stdio)

Scelte proposte per questo repository, dedotte dalla struttura FastAPI/CLI/SQLite:

- Creare un entry point dedicato, ad esempio `vinted-assistant-mcp`, e un modulo avviabile con `python -m vinted_assistant.mcp_server`.
- Riutilizzare i servizi di dominio e lo store SQLite direttamente; non effettuare richieste HTTP all'API locale dai tool MCP.
- Tenere configurazione e cartella dati indipendenti dalla directory corrente. Un client MCP può avviare il programma da qualsiasi cartella, anche dopo l'installazione in un ambiente isolato.
- Usare tool per lettura, importazione foto, creazione e modifica bozze, validazione ed esportazione. Pubblicazione Vinted, sessioni browser e credenziali richiedono implementazioni e verifica distinte.
- Rendere l'esportazione consultabile e riutilizzabile: ritornare ID, dati della bozza e percorsi degli artefatti, evitando dipendenze implicite dalla dashboard.

## Annotazioni e accesso alle foto

Le annotazioni descrivono comportamento, non applicano autorizzazioni. Per le letture usare `read_only_hint=True`; per import e creazione indicare le scritture; per sostituzioni e cancellazioni dichiarare l'effetto distruttivo. `idempotent_hint=True` è corretto soltanto quando ripetere gli stessi argomenti non aggiunge effetti. `open_world_hint=False` si applica a operazioni interamente locali. [Schema ufficiale ToolAnnotations](https://modelcontextprotocol.io/specification/2025-11-25/schema#toolannotations)

La specifica legacy roots richiede il rispetto dei confini e la validazione dei percorsi. Per questo progetto si propone una allowlist configurata all'avvio, applicata dal server indipendentemente dalle capacità del client: canonicalizzare i file, risolvere symlink, richiedere file regolari entro una cartella autorizzata, rifiutare directory, percorsi fuori confine e file troppo grandi. Non usare il semplice confronto del prefisso testuale. Questo controllo è una scelta applicativa; MCP non crea una sandbox filesystem. [Specifica ufficiale roots 2025-11-25](https://modelcontextprotocol.io/specification/2025-11-25/client/roots#security-considerations)

Applicare anche verifica del contenuto immagine e limiti di numero e dimensione. Copiare le foto nella cartella dati del progetto, assegnare nomi interni e conservare gli originali. L'allowlist va fornita tramite configurazione del processo, non ampliata da un argomento controllabile dal modello. Queste sono scelte di implementazione proposte per l'import locale.

## Test attraverso un processo reale

**Differenza tra 2.0.0 e 2.3.0:** nella versione 2.0.0 `Client` accetta URL, server in-process e trasporti; per stdio si passa `Client(stdio_client(params))`. Il supporto diretto `Client(StdioServerParameters(...))` è presente in 2.3.0 e non va usato quando il requisito minimo è 2.0.0. Le firme utilizzate di `MCPServer`, dei tre decorator e di `run(transport="stdio")` sono compatibili tra le due versioni; le estensioni opzionali più recenti restano fuori dall'integrazione. [Client 2.0.0](https://github.com/modelcontextprotocol/python-sdk/blob/v2.0.0/src/mcp/client/client.py), [Client 2.3.0](https://github.com/modelcontextprotocol/python-sdk/blob/v2.3.0/src/mcp/client/client.py)

Il percorso seguente verifica un processo reale e mantiene la negoziazione automatica moderna/legacy già supportata da 2.0.0. Non richiede un server HTTP. Un test in-process, da solo, non verifica entry point, framing stdio e working directory. [Release ufficiale 2.0.0](https://github.com/modelcontextprotocol/python-sdk/releases/tag/v2.0.0)

```python
import asyncio
import sys
from mcp import Client, StdioServerParameters
from mcp.client.stdio import stdio_client

async def check_modern_stdio():
    params = StdioServerParameters(
        command=sys.executable,
        args=["-m", "vinted_assistant.mcp_server"],
    )
    async with Client(stdio_client(params)) as client:
        tools = await client.list_tools()
        assert tools.tools
        assert client.protocol_version

asyncio.run(check_modern_stdio())
```

`stdio_client` è ancora disponibile in `mcp.client.stdio`; accetta `StdioServerParameters` con comando, argomenti, ambiente e working directory e restituisce i due stream. [Sorgente trasporto stdio 2.0.0](https://github.com/modelcontextprotocol/python-sdk/blob/v2.0.0/src/mcp/client/stdio.py)

Anche `ClientSession` rimane disponibile. Il suo `initialize()` esegue la negoziazione legacy; `discover()` è il percorso moderno esplicito. I timeout sono numeri di secondi. Per verificare compatibilità legacy usare il seguente schema insieme a un test `Client` moderno. [Sorgente ClientSession 2.0.0](https://github.com/modelcontextprotocol/python-sdk/blob/v2.0.0/src/mcp/client/session.py)

```python
import sys
from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client

async def check_installed_server():
    launch = StdioServerParameters(
        command=sys.executable,
        args=["-m", "vinted_assistant.mcp_server"],
    )
    async with stdio_client(launch) as (reader, writer):
        async with ClientSession(reader, writer, read_timeout_seconds=20) as session:
            initialized = await session.initialize()
            tools = await session.list_tools()
            assert initialized.server_info.name
            assert tools.tools
```

Verifiche proposte: discovery di tool/risorse/prompt; import di una vera piccola immagine di test; bozza persistita in SQLite temporaneo; modifica e rilettura; export esistente e interpretabile; prompt e risorsa concreta; rifiuto di percorso esterno, file non immagine e ID mancante; riavvio con lo stesso archivio. Eseguire anche da una directory diversa dal repository e da un wheel installato. Nessuno di questi test dimostra una pubblicazione reale su Vinted.

## Installazione da GitHub

`uvx --from` può installare un pacchetto da Git ed eseguire il console script che espone. Il comando è isolato dal progetto corrente e può essere fissato a un tag o commit. [Guida ufficiale uv tools](https://docs.astral.sh/uv/guides/tools/#requesting-different-sources)

Se `pyproject.toml` resta sotto `backend`, il frammento `#subdirectory=backend` seleziona il pacchetto interno. Comando proposto, da sostituire con URL e ref effettivi dopo la pubblicazione:

```text
uvx --from "git+https://github.com/OWNER/REPOSITORY.git@REF#subdirectory=backend" vinted-assistant-mcp
```

La sintassi `subdirectory` è documentata per le sorgenti Git di uv; il console script va dichiarato nel manifest del pacchetto. Per una consegna riproducibile preferire un tag pubblicato o uno SHA verificato. Questo documento non afferma che il repository remoto esista già. [Documentazione ufficiale uv sulle dipendenze Git](https://docs.astral.sh/uv/concepts/projects/dependencies/#git)


# Vinted Assistant 0.2.0

## Obiettivo

Ridurre il lavoro necessario per preparare annunci dalle proprie fotografie reali,
con una coda locale modificabile e un MCP interoperabile. Nessuna API privata
Vinted, credenziale o pubblicazione automatica.

## Funzioni

1. Importare 1–10 JPG/PNG/WEBP reali e una nota italiana.
2. Validare contenuto, MIME, dimensioni, prezzi e campi obbligatori.
3. Generare campi e suggerimenti euristici offline, senza inventare dettagli.
4. Salvare, leggere, modificare e cancellare bozze SQLite e copie delle fotografie.
5. Usare le stesse regole da HTTP, CLI e MCP.
6. Offrire da MCP strumenti tipizzati, elenco paginato, risorse e prompt di revisione.
7. Limitare l'import MCP a una cartella configurata all'avvio.
8. Preparare il link del modulo ufficiale per una singola bozza.
9. Registrare lo stato remoto soltanto come verifica dichiarata del chiamante.
10. Conservare gli originali e distribuire soltanto codice e documentazione.

## Criteri di consegna

- MCP stdio avviabile da pacchetto installato e da una cartella differente.
- Test tramite client SDK ufficiale e processo server reale, con riavvio e SQLite persistente.
- Errori di validazione non producono record o fotografie orfane.
- Dashboard: test, lint, TypeScript e build di produzione.
- Bridge: protezione da cambio pagina/UUID e risposte asincrone obsolete.
- Repository GitHub con istruzioni, CI e dati privati esclusi.
- Distinzione esplicita tra test locali e integrazione sul sito Vinted autenticato.

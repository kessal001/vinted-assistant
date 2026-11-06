# Sicurezza e dati

Vinted Assistant è un'applicazione locale per le proprie bozze.
Non esporre l'API HTTP su interfacce pubbliche: usa 127.0.0.1.
MCP usa stdio e deve essere avviato da un client locale attendibile.

Configura una cartella dedicata per l'importazione foto. Non usare la home,
il disco intero o cartelle contenenti documenti estranei agli articoli.
Le fotografie sono copiate nei dati dell'app, non caricate automaticamente sul sito.

Non caricare su GitHub database, foto, cookie, credenziali o file .env.
Gli archivi sorgente e .gitignore li escludono. Verifica sempre ciò che aggiungi.

Per un problema di sicurezza usa la segnalazione privata di GitHub se disponibile;
evita issue pubbliche contenenti dati o percorsi personali.

Le nuove installazioni richiedono Pillow 13 per le correzioni dei decoder immagini.
Il frontend mantiene un override di `minimatch` 11.0.1 limitato a
`@typescript-eslint/typescript-estree` (GHSA-g3hv-75wg-m249): rimuoverlo quando
typescript-eslint richiederà una versione corretta. L'override riguarda il lint,
non il codice eseguito dalla dashboard. Il lockfile include anche Zod corretto
per GHSA-mrhx-c7xc-m3w5.

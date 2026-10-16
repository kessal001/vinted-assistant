# Contribuire

Installa backend e frontend come descritto nel README.
Esegui pytest nel backend, poi test, lint, typecheck e build nel frontend.

Verifica i cambiamenti MCP attraverso il trasporto stdio reale, non soltanto chiamando
le funzioni Python. I test devono usare archivi temporanei e fotografie sintetiche
di prova; non puntare al database dell'utente.

Mantieni le operazioni su bozze in ListingService: HTTP, CLI e MCP devono condividere
le stesse validazioni e regole di persistenza. Le annotazioni MCP descrivono gli
effetti; i controlli devono essere applicati nel codice.

Il progetto non deve usare cookie, API private o pubblicazione automatica su Vinted.
Le verifiche locali vanno distinte dagli esiti sul sito autenticato.

Non è ancora stata scelta una licenza open source. Contatta il titolare prima di
proporre contributi o riutilizzi che richiedano una concessione di diritti.

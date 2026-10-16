# Verifica Vinted Assistant 0.2.0 — 15 ottobre 2026

## Esiti locali effettivamente verificati

| Controllo | Esito |
| --- | --- |
| Backend, API, validazione, CLI e MCP | **46 test passati** |
| Dashboard e bridge Chrome | **113 test passati**, 6 file |
| ESLint | Passato |
| TypeScript, senza build preesistente richiesta | Passato |
| Next.js produzione | Build completa passata, incluse verifica tipi e pagine statiche |
| Wheel Python | Costruito e installato in un ambiente isolato |
| Comando installato vinted-assistant-mcp | Help e protocollo stdio verificati |
| MCP dal wheel, directory esterna al repository | Discovery degli 8 tool e creazione/rilettura reali passate |
| Servizio HTTP reale | Health, creazione, lettura foto, modifica, cancellazione e coda finale vuota passate |
| Dashboard in produzione | HTTP 200 e contenuto della pagina verificati |
| Archivio sorgente | Generato soltanto dall'indice Git e sottoposto al controllo delle esclusioni |

I test MCP usano l'SDK ufficiale 2.0.0 con un vero processo stdio:
negoziazione moderna e legacy, schemi e risultati strutturati, risorse, prompt,
errori, conferme e riavvio con persistenza SQLite. Il server HTTP non è richiesto
dai test del protocollo.

Le regressioni backend coprono prezzi non finiti o non memorizzabili, null sui
campi obbligatori, pulizia delle fotografie dopo un errore DB, origine HTTP,
Host e limiti della cartella di import. I test del bridge coprono anche risposte
ritardate e cambi di pagina/UUID dopo il primo trasferimento.

## Ambiente di esecuzione

Verifiche locali su Windows con Python 3.11.15. La rete della shell non consente
download: sono state usate dipendenze ufficiali già disponibili, senza modificare
gli ambienti originali. Il wheel è stato installato senza riscaricarle.
Una installazione a freddo richiede rete e viene affidata anche alla CI.

Per i test in questo ambiente gestito, le cartelle temporanee hanno ereditato
le autorizzazioni del workspace e il client asyncio ha usato il selector loop
supportato dall'SDK. Questi adattamenti del runner locale non sono nel codice
distribuito. Vitest è stato eseguito con configLoader native e pool threads.

Il launcher standard ha rilevato la porta 8000 già occupata. Il servizio esistente
non è stato arrestato. Il collaudo HTTP ha avviato soltanto processi di prova su
18080 e 13000 e li ha arrestati al termine. Il default del launcher usa la build
di produzione; lo sviluppo resta disponibile con --dev.

## Confini della verifica

- I test HTTP e della dashboard non sostituiscono una prova browser sul sito Vinted.
- Non è stato verificato un nuovo caricamento o salvataggio nel Vinted autenticato.
- Nessuna nuova pubblicazione Vinted è stata eseguita.
- Le annotazioni e le conferme MCP non dimostrano un risultato remoto.
- Il server non è stato registrato automaticamente nella configurazione globale del client.
- La CI Windows/Linux è predisposta nel repository; il suo esito remoto va controllato
  nella pagina Actions.

Database e fotografie originali sono stati preservati. Gli archivi di consegna
contengono codice e documentazione; i dati temporanei di collaudo sono esclusi.

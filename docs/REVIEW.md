# Riesame completo — 15 ottobre 2026

## Quadro del progetto

Il progetto prepara bozze locali: una nota e fotografie reali producono campi modificabili,
salvati in SQLite. La dashboard e il bridge aiutano l'utente a trasferirli nel modulo
ufficiale. Il generatore è deterministico: non identifica automaticamente gli oggetti
e non consulta prezzi di mercato. L'eventuale lettura barcode resta opzionale.

Il riesame ha coperto backend, schema SQLite, validazione immagini, generatore,
CLI, launcher, dashboard, estensione, test, pacchetto Python e distribuzione GitHub.

## Problemi individuati e interventi

| Area | Problema o stato rilevato | Intervento |
| --- | --- | --- |
| MCP | Nessun server presente | SDK ufficiale 2.0.0, entry point stdio, otto tool, risorse e prompt |
| Logica condivisa | Creazione duplicata tra HTTP e CLI | ListingService condiviso anche dal server MCP |
| Prezzi | NaN, infinito e valori arrotondati a zero potevano arrivare allo storage | Validazione comune di finitezza, limite e centesimi |
| PATCH | null su campi obbligatori causava errori di persistenza | Rifiuto prima delle scritture; metadati opzionali cancellabili |
| Fotografie | Possibili copie orfane dopo un errore del database | Compensazione delle scritture e chiusura degli upload |
| Immagini grandi | Il limite compresso non limita i pixel decodificati | Soglia di 25 megapixel e gestione delle decompression bomb |
| SQLite | Il context manager gestiva transazioni, ma non chiudeva esplicitamente la connessione | Chiusura garantita e timeout delle connessioni |
| Aggiornamenti DB | I nomi colonna erano costruiti da un dizionario non validato nello storage | Validazione ListingPatch prima della query |
| Percorsi dati | Default legato alla cartella del pacchetto | Archivio configurabile e fallback utente per wheel/uvx |
| Import MCP | Accesso ai file da definire | Cartella autorizzata all'avvio, canonicalizzazione e rifiuto di percorsi esterni/UNC |
| Stato remoto | Un aggiornamento poteva sembrare una verifica del sito | Tool dedicato con conferma dichiarata; nessuna pubblicazione automatica |
| Origine HTTP | Una pagina estranea poteva tentare un POST semplice locale | Rifiuto delle scritture cross origin e controllo Host |
| Categoria | Genere dell'abbigliamento e sottogenere del libro erano assunti | Suggerimenti generici da completare nel sito |
| Anteprime | Object URL non sempre liberati su sostituzione o smontaggio | Cleanup dell'effetto React |
| Font/build | Download di font durante la build | Font di sistema; build eseguibile dopo l'installazione senza quel download |
| Tipi frontend | Layout dipendente da tipi generati prima del primo build | ReactNode esplicito; typecheck autonomo |
| Build Windows | Avvio di processi secondari bloccato nell'ambiente di verifica | Worker thread e checker TypeScript tramite API, con controlli attivi |
| Avvio | Percorso Python solo Windows e possibile uso di porte già occupate | Selezione piattaforma, controllo porte e comando Node diretto |
| GitHub | Nessuna struttura di distribuzione | CI, documentazione, esclusioni dati e script archivio |

La precedente nota QA indicava un difetto del bridge sul cambio di route.
Nel codice recuperato era già presente una protezione più recente. I test attuali
verificano cambio pagina/UUID, risposte ritardate, chiusura del pannello e mancato
reinoltro delle fotografie: 113 test frontend superati.

## Scelte MCP

Il processo usa direttamente ListingService e SQLite: non richiede dashboard,
server HTTP, credenziali Vinted o chiavi AI per gestire le bozze.
L'import è disabilitato senza cartella foto configurata. Gli strumenti di modifica
e cancellazione dichiarano i propri effetti tramite annotazioni MCP.

Una conferma di stato remoto è una dichiarazione del chiamante: il server non può
dimostrare che Vinted abbia salvato o pubblicato. Il trasferimento restituisce un link
e istruzioni. API e bridge servono soltanto quando l'utente decide di compilare il sito.

La query della coda MCP è paginata nel database. Le foto e i dati personali sono
esclusi dalla distribuzione. Il server stdio non apre listener di rete.

## Verifica e limiti

Gli esiti aggiornati sono in [QA.md](../QA.md). I test del protocollo avviano
un processo reale e verificano persistenza e riavvio. I dati dell'utente non sono usati
come fixture. Le fonti tecniche sono in [MCP_RESEARCH.md](MCP_RESEARCH.md).

Da verificare separatamente sul sito autenticato: anteprime effettivamente caricate,
campi obbligatori, persistenza della bozza e pubblicazione. Le euristiche di prezzo
e categoria richiedono sempre revisione. Non sono stati aggiunti scraping, API private,
gestione di account, messaggi a compratori o pubblicazione automatica.

La risoluzione a freddo delle dipendenze richiede rete. L'ambiente di verifica ha usato
dipendenze già disponibili; il vecchio uv.lock 0.1.0 è stato rimosso perché non
descriveva MCP. L'SDK MCP è fissato a 2.0.0 nel manifest. La CI copre installazioni
pulite quando viene eseguita su GitHub.

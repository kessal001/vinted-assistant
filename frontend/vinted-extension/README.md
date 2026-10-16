# Vinted Assistant Bridge

Estensione Chrome Manifest V3 per il Vinted Assistant locale. Non pubblica annunci, non esporta cookie e non usa endpoint privati Vinted.

## Installazione e aggiornamento

1. Avvia Vinted Assistant dal progetto con `start-vinted-assistant.bat`.
2. Se stai usando il pacchetto ZIP, estrailo in una cartella: il file `manifest.json` deve trovarsi direttamente in quella cartella.
3. Nel Chrome già autenticato apri `chrome://extensions` e abilita Modalità sviluppatore.
4. Usa Carica estensione non pacchettizzata e seleziona la cartella contenente `manifest.json`. Nel progetto originale è `frontend/vinted-extension`.
5. Se l'estensione era già installata, premi Ricarica sulla sua scheda dopo ogni aggiornamento e riapri il modulo Vinted.

## Uso

- Dalla dashboard premi **Trasferisci su Vinted** sulla scheda selezionata. Le modifiche vengono salvate prima dell'apertura.
- Nel pannello del modulo ufficiale premi **Compila campi e foto**. Controlla che le fotografie reali compaiano nell'anteprima del sito.
- I selettori personalizzati o readonly restano manuali. Apri **Valori da scegliere nel modulo** per leggere e copiare i campi proposti. La categoria si sceglie dentro il modulo, non dal menu globale Catalogo.
- Dopo aver scelto la categoria puoi ricompilare i campi appena comparsi: il pannello non invia una seconda volta le fotografie nella stessa sessione.
- **Salva bozza** è un pulsante del sito Vinted, non del bridge. Verifica la bozza nel profilo e il prezzo corretto prima di aggiornare lo stato locale. La casella di conferma del pannello non crea una bozza remota.
- Non vengono premuti automaticamente **Carica** o **Pubblica**.

## Dati e limiti

L'API è fissa su `http://127.0.0.1:8000`. Il worker controlla pagina ufficiale, frame principale, estensione mittente e UUID selezionato. Ogni fotografia deve appartenere a quell'articolo; sono ammessi JPEG/PNG/WebP fino a 10 MB e al massimo 10 foto per scheda. Le richieste locali hanno timeout e non portano credenziali del browser.

La preparazione e la coda restano sul computer. Solo il trasferimento esplicito porta dati e foto nel modulo Vinted, dove il sito può caricare le immagini. Il ponte non garantisce il completamento dell'upload remoto solo perché il file è stato assegnato al controllo HTML.

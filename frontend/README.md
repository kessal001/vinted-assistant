# Dashboard e bridge Chrome

Leggi il [README del progetto](../README.md) per l'avvio completo.

```sh
npm ci
npm run dev -- --hostname 127.0.0.1
npm test
npm run lint
npm run typecheck
npm run build
```

API predefinita: http://127.0.0.1:8000.
La variabile NEXT_PUBLIC_API_BASE_URL può cambiarla per la dashboard; il bridge
rimane vincolato all'API loopback documentata e alla pagina ufficiale Vinted italiana.

Carica frontend/vinted-extension come estensione non pacchettizzata.
I test del bridge sono locali: il caricamento e la persistenza sul sito autenticato
richiedono una verifica distinta.

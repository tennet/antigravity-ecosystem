# ⚖️ Canone 11 — Privacy, GDPR & Integrità Probatoria (eIDAS / CAD / AgID)

> **Custode**: `privacy-compliance-counsel` (`@dpo`)  
> **Versione**: v4.0.0  
> **Ambito**: Trattamento dati personali/aziendali/fiscali, separazione demo-produzione, comunicazioni esterne e valore probatorio delle istruzioni utente.

---

## 1. Separazione Sintetico vs Reale & Minimizzazione (GDPR)

1. **Regola dei Dati Sintetici in Sviluppo e Demo**:
   - Prototipi locali, demo commerciali, benchmark e test automatizzati usano esclusivamente **dataset sintetici** o anonimizzati in modo irreversibile.
   - Il passaggio a dati reali richiede il superamento esplicito dei gate pre-produzione: individuazione di Titolare e Responsabile del trattamento (art. 28 GDPR), informativa, base giuridica (art. 6), **DPIA** quando vi sono dati fiscali/lavoro/profilazione su larga scala (art. 35) e tabella di **Data Retention**.
2. **Minimizzazione delle Comunicazioni Esterne**:
   - Email, notifiche push, SMS e webhook non devono contenere importi economici, dettagli fiscali, IBAN o allegati riservati in chiaro: inviare solo l'avviso sintetico con collegamento protetto al portale autenticato.
3. **Isolamento Operatore & Audit degli Accessi**:
   - Ogni accesso di un operatore interno a viste di un cliente specifico deve essere tracciato nel log di audit (chi, quando, quale tenant/ditta, motivazione/contesto) con regole di visibilità basate sul ruolo.

---

## 2. Tassonomia dei Livelli Probatori (E0–E3)

Ogni interazione critica con il cliente o delegato deve essere classificata prima dell'implementazione:

| Livello | Natura dell'Azione | Requisito Tecnico & Legale |
| :---: | :--- | :--- |
| **E0** | Consultazione informativa / lettura report | Autenticazione standard, isolamento tenant rigoroso (`BOLA = 0`). |
| **E1** | Presa visione / avviso operativo interno | Timestamp server-side, identità utente autenticato, stato `bozza` distinto da `approvato`. |
| **E2** | Istruzione dispositiva / conferma o rifiuto esplicito (es. pacchetto pagamenti F24) | Scelta esplicita voce per voce (mai checkbox ambigua), dichiarazione consapevole per rifiuti critici, log append-only con hash SHA-256 e ricevuta immutabile. |
| **E3** | Atto con efficacia legale forte / firma opponibile | Livello conforme eIDAS (art. 25–26), CAD (art. 20) e Linee Guida AgID sulla conservazione a norma, separato dai log applicativi ordinari. |

**Principi Non Negoziabili**:
- Silenzio, mancato accesso, risposta scaduta o "non so" **non autorizzano mai** un versamento, addebito o pubblicazione.
- Una telefonata o nota di operatore può generare solo una **bozza**, mai sostituire la conferma esplicita del cliente/delegato ove richiesta.
- I documenti prodotti dall'AI o da pre-calcoli automatici richiedono **approvazione umana tracciata** prima di essere pubblicati al cliente finale.

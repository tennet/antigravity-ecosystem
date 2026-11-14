---
name: gdpr-evidence-compliance
description: Presidio operativo GDPR (separazione dati sintetici vs reali, DPIA, art. 28/30, retention, minimizzazione notifiche) e architettura dei livelli probatori E0-E3 (eIDAS, CAD, AgID).
---

# GDPR & Evidence Compliance (E0–E3)

## 1. Gate Pre-Produzione su Dati Reali
1. **Separazione Ambiente**: prototipi, benchmark e demo usano **solo dati sintetici**; blocca il caricamento di anagrafiche o bilanci reali fino a chiusura dei gate normativi.
2. **Checklist GDPR**: identifica Titolare e Responsabile del trattamento (art. 28), verifica informativa e base giuridica (art. 6), redigi/aggiorna **DPIA** (art. 35) per trattamenti fiscali/lavoristici su larga scala e definisci la tabella di **Data Retention** (tempi di conservazione e cancellazione).
3. **Minimizzazione**: vieta importi economici, IBAN o allegati riservati in chiaro in email, SMS o webhook; invia solo notifiche sintetiche verso il portale autenticato.

## 2. Livelli Probatori (E0–E3) & Integrità Log
- **E0** (consultazione), **E1** (presa visione/bozza interna), **E2** (istruzione dispositiva cliente con scelta esplicita voce per voce e dichiarazione consapevole su rifiuti critici), **E3** (firma/conservazione a norma eIDAS art. 25–26, CAD art. 20, AgID).
- **Regole Non Negoziabili**:
  - Silenzio, scadenza o "non so" non equivalgono mai ad autorizzazione.
  - I log probatori E2/E3 devono essere **append-only**, con hash di integrità e separati dai log applicativi ordinari.
  - Pre-calcoli automatici o suggerimenti AI richiedono sempre **approvazione umana tracciata** prima della pubblicazione al cliente.

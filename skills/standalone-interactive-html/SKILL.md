---
name: standalone-interactive-html
description: Creazione di dimostratori esecutivi e dashboard HTML single-file offline (stile mission_control.html e showcase): asset inlinati zero-CDN, CSP SHA-256, event delegation data-action, SVG 2.5D e UX plain-language stile @munari.
---

# Standalone Interactive HTML & Plain-Language UX

## 1. Portabilità & Sicurezza Offline
1. **Zero CDN esterni**: quando il file è destinato a uso offline o dimostrativo portabile, inlina CSS e JS nel documento evitando `<script src="https://cdn...">`.
2. **CSP Strict (SHA-256)**: imposta `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'sha256-...'; img-src data:; connect-src 'self';">`.
3. **DOM Sicuro**:
   - **Vietato** `onclick="..."` inline negli attributi HTML: usa attributi `data-action="..."` con delegazione eventi centralizzata (`addEventListener`).
   - **Vietato** `.innerHTML` con stringhe dinamiche o input utente/API: usa `textContent` e creazione nodi DOM (`createElement`).

## 2. Information Design Plain-Language (Stile `@munari`)
- Per utenti non tecnici (PMI, artigiani, responsabili non IT):
  - Max **4 indicatori chiave** nella vista principale; progressive disclosure per i dettagli tecnici.
  - Struttura ogni scheda critica su *Cosa significa* + *Cosa puoi fare adesso*.
  - Separa nettamente ciò che è **Provvisorio / Simulato** da ciò che è **Approvato / Reale**.
  - Rendi le simulazioni interattive (cursori/preset/SVG 2.5D) veloci e chiare anche su schermi piccoli e stampa.

---
name: creative-ui-art-direction
description: Direzione artistica UI/UX moderna, gusto grafico d'autore, anti-AI-slop, sistemi cromatici OKLCH multi-stile, tipografia editoriale, arte vettoriale SVG, motion design e prototipazione Visual-First (image-generator, generative_ui, browser, Mobbin/Figma/Canva). Attivare per @steve o per qualunque dashboard, sito, app o redesign dove servano originalità e qualità estetica superiore.
---

# 🎨 Creative UI Art Direction & Visual Craft (@steve)

> **Obiettivo**: Eliminare le UI "tutte uguali" fatte a stampino (card grigie/nere + bordo standard + blu/viola generico + icone emoji) e progettare interfacce con **identità visiva riconoscibile, raffinatezza tipografica e artigianalità grafica reale**.

---

## 1. Legge Zero: Mai Usare lo Stesso Template "Default AI"

Prima di scrivere una sola riga di HTML/CSS, **scegli e dichiara una Direzione Artistica intenzionale** tra gli archetipi sotto (o crea un ibrido motivato) in base al dominio reale, all'utente e al contesto d'uso (diurno/PMI vs notturno/dev vs tattile/executive).

**Anti-Pattern Vietati ("AI Slop")**:
1. ❌ Usare sempre `#09090b` + card `#18181b` + ciano/indigo indistintamente su qualsiasi progetto.
2. ❌ Riempire lo schermo di bagliori sfocati neon (`box-shadow` colorati dappertutto) per simulare "modernità".
3. ❌ Scrivere descrizioni testuali astratte di layout invece di mostrare **anteprime visive reali** (`image-generator` / `generative_ui`).
4. ❌ Accatastare box identici 3×N con la stessa identica gerarchia tipografica senza un *Focal Point* chiaro.
5. ❌ Usare emoji di sistema come unica grafica al posto di icone vettoriali coerenti, illustrazioni SVG geometriche o micro-diagrammi curati.

---

## 2. Catalogo dei 6 Archetipi Visivi Moderni

Scegli un archetipo preciso all'inizio del design:

| Archetipo | Ispirazione Reale | Palette Chiave | Tipografia & Ritmo | Quando usarlo |
| :--- | :--- | :--- | :--- | :--- |
| **1. Obsidian Precision** | Linear, Vercel, Raycast | Canvas `#09090B`, Card `#111216`, Bordo `1px #22242E`, 1 solo accento nitido (`#38BDF8` o `#10B981`), idle attenuati | Sans geometrica + Mono tabellare, tracking `-0.025em`, zero glow diffusi | Console dev, orchestratori, devtools ad alta densità |
| **2. Swiss Editorial Paper** | SBB, Dieter Rams, Stripe Docs | Carta calda `#F6F5F1`, Card `#FFFFFF`, Inchiostro `#141413`, Hairline `#DDDAD2`, Accento cobalto `#0052CC` o vermiglio `#D9381E` | Grotesque pulita + display contrastato, righelli sottili, whitespace strutturale >= 28% | Gestionali, report executive, flussi multi-fase, portali diurni |
| **3. Warm Analog Tactile** | Teenage Engineering, Braun, Panic | Espresso matte `#1C1917`, Moduli `#26221F`, Bordo `#3B3530`, Crema `#F5EFE6`, Accento arancio `#EA580C` / verdigris `#2DD4BF` | Mono strumentale + pesi decisi, LED di stato netti, micro-connettori curvi | Telemetry studio, dashboard hardware/IoT, AI workbench originali |
| **4. Alabaster Soft-Depth** | Apple macOS/iPadOS, Craft, Stripe | Perla `#F4F6FA`, Vetro satinato `#FFFFFF/90%`, Ombre diffuse multilivello ultra-tenui, Accento indaco `#4F46E5` | SF/Inter/Jakarta leggibile, raggi morbidi `16px–24px`, gerarchia a Focus Stage | SaaS B2B eleganti, workflow collaborativi, app PMI/clienti |
| **5. Editorial Magazine Bold** | Pitch, Framer Showcase, Arc | Contrasti puri (`#FAFAF9` vs `#0C0A09`), blocchi asimmetrici, un solo colore firma saturo, bordi netti | **Serif Display** (`Instrument Serif` / `Newsreader` fallback Georgia) + **Sans moderna** | Landing page, product showcase, report interattivi |
| **6. Technical Blueprint** | Aerospace CAD, Vercel Observability | Cobalt `#0A1628` / Graphite `#0D1117`, Reticolo `1px` millimetrato a bassa opacità (`0.06`), Ice `#F0F7FF`, Cyan `#38BDF8` | Mono integrale per quote/coordinate + indicatori ortogonali | Mappe di sistema, architetture infrastrutturali, audit |

---

## 3. Tipografia Moderna, Proporzioni & Colorimetria OKLCH

1. **Font Pairing & Scala Dinamica**:
   - Abbinare sempre un carattere **Display** (titoli con `letter-spacing: -0.03em; line-height: 1.08`), un **UI Body** leggibile (`15px–16px`, `line-height: 1.55`) e un **Monospace** con `font-variant-numeric: tabular-nums` per metriche, prezzi, date e timestamp (evita saltelli visivi nei numeri live!).
   - Per app **HTML standalone offline** (zero CDN esterni), usare stack di sistema ad alta raffinatezza (`ui-sans-serif, "SF Pro Display", "Segoe UI", system-ui` + `Georgia` / `"Iowan Old Style"` quando serve accento editoriale serif + `"SF Mono", "JetBrains Mono", ui-monospace`).
   - Usa `clamp()` per titoli fluidi: es. `font-size: clamp(1.75rem, 2.5vw + 0.5rem, 3.25rem)`.

2. **Regola Cromatica 60 / 30 / 10 in OKLCH**:
   - **60% Superficie primaria**: tela di fondo con leggerissimo sottotono caldo o freddo (mai nero `#000` piatto né bianco `#FFF` accecante su grandi aree statiche).
   - **30% Superfici secondarie**: card e moduli differenziati per *luminosità/tonalità graduale* prima ancora che per i bordi spessi.
   - **10% Accento intenzionale**: **un solo colore primario firma** riservato a focus, CTA principale e stato attivo; stati semaforici accessibili **WCAG AA (>= 4.5:1)** sempre accompagnati da etichetta testuale (anti-daltonismo).

3. **Profondità Sottile (Micro-Craft)**:
   - Un leggero gradiente radiale superiore (`opacity: 0.08–0.14`) o un micro-pattern SVG inline (`data:image/svg+xml` con grid punteggiato o grain al `2–3%`) rende subito la superficie progettata anziché piatta — sempre a basso contrasto per non disturbare i testi.

---

## 4. Arte Vettoriale SVG, Grafici & Motion Physics

1. **SVG Custom al posto di Box Vuoti**:
   - Disegna connettori con curve di Bézier pulite (`<path d="M ... C ...">`), micro-sparkline SVG, badge geometrici e illustrazioni minimali coerenti con la palette scelta.
   - Su animazioni SVG ricorda sempre `transform-box: fill-box; transform-origin: center;` per evitare rotazioni/salti rispetto all'angolo `(0,0)` del viewBox.

2. **Motion Con Scopo (Zero Animazioni Nervose)**:
   - Curva principale di decelerazione fluida: `cubic-bezier(0.22, 1, 0.36, 1)` (durata `180ms–320ms`).
   - Anima solo proprietà composited (`transform`, `opacity`) — mai `width`/`top`/`left` in loop continui — e rispetta `@media (prefers-reduced-motion: reduce)`.
   - In streaming live (`SSE`/WebSocket), **aggiorna il DOM in modo incrementale** senza ricreare i nodi invariati e senza troncare le animazioni in corso.

---

## 5. Pipeline Obbligatoria "Visual-First" (Strumenti Reali di @steve)

Quando il task richiede progettazione grafica nuova, restyling o decisione estetica importante:

1. **Riferimento Reale (se plugin attivi)**:
   - **Mobbin**: cerca schermate reali di app di riferimento per il dominio prima di disegnare l'architettura informativa.
   - **Figma**: leggi i token/variabili/frame da file Figma reali o struttura componenti pronti per Code Connect.
   - **Canva**: produci/esporta asset grafici, hero visual o kit social/brand coordinati.
2. **Prototipo Visivo Prima del Codice**:
   - Quando presenti proposte grafiche all'utente, usa **`image-generator`** per produrre mockup 16:9 ad alta nitidezza di `2–5` direzioni distinte (mostrate in **carosello artifact**) **oppure** **`generative_ui`** per prototipi HTML/SVG interattivi cliccabili — mai solo tabelle di colori a parole.
3. **Ispezione Render Reale**:
   - Dopo l'implementazione su app web locali (`localhost`), usa il subagente **`browser`** (Chrome DevTools / WebView) per ispezionare il rendering visivo reale (desktop + mobile), verificare allineamenti, zero overlap e contrasto prima di dichiarare pronto il design.

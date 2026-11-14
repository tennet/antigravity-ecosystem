# 🎨 Canone di Design UI/UX, Bento Grid & Sistemi Visivi

> **Riferimento Primario per**: `ui-ux-designer`  
> **Fonti Fondamentali**:  
> - Adam Wathan & Steve Schoger, *Refactoring UI* (Full-Stack Radio)  
> - Steve Krug, *Don't Make Me Think: A Common Sense Approach to Web Usability* (New Riders)  
> - Standard dei Design System: Vercel Geist, Tailwind UI, shadcn/ui, Linear Design Specs

---

## 1. Principi di Architettura Visiva & Spaziatura

1. **Gerarchia Visiva Prima del Colore**:
   - Una schermata deve comunicare la priorità informativa anche se visualizzata in scala di grigi.
   - Non usare colori accesi per differenziare testi secondari; usa variazioni di peso font (`font-medium` vs `font-normal`) e scala di contrasto del testo (`text-zinc-100` vs `text-zinc-400`).
2. **Griglia 4px/8px Baseline**:
   - Tutte le dimensioni, margini e padding devono essere multipli rigorosi di 4px o 8px (`p-2`, `p-4`, `p-6`, `gap-4`, `gap-6`).
   - Evita spaziature arbitrarie (es. `margin: 13px`) che rompono l'armonia ritmica della pagina.
3. **Bento Grid Asimmetrica**:
   - Organizza le dashboard in blocchi modulari con campiture asimmetriche (es. schede primarie a 2 colonne di ampiezza, statistiche secondarie su colonna singola).
   - Ogni scheda (*card*) deve avere confini chiari: sfondo scuro profondo (`#09090b` / `#18181b`), bordo sottile e netto a contrasto controllato (`border-zinc-800`), e raggio di curvatura coerente (`rounded-xl` o `rounded-2xl`).

---

## 2. Palette Dark Mode ad Alto Impatto (Zinc & Cyan)

1. **Evita il Nero Puro (`#000000`) per le Superfici Grandi**:
   - Usa tinte scure neutre graduate per creare profondità e stratificazione:
     - Background pagina: `#09090b` (Zinc 950)
     - Sfondo card/pannelli: `#18181b` (Zinc 900)
     - Sfondo elementi interattivi (input, hover): `#27272a` (Zinc 800)
     - Bordi strutturali: `#3f3f46` (Zinc 700) a bassa opacità
2. **Colore Accento Funzionale**:
   - Usa un colore accento vivace (es. Cyan neon `#06b6d4` / `#22d3ee`) con parsimonia estrema: solo per inviti all'azione (CTA primari), indicatori di stato attivo o focus states.

---

## 3. Micro-Interazioni, Feedback di Stato & Accessibilità

1. **Feedback Istantaneo**:
   - Ogni interazione utente (hover, active, focus, click) deve produrre una risposta visiva immediata con transizioni fluide (durata 150ms-200ms con easing `ease-out`).
2. **I 4 Stati Obbligatori dei Componenti**:
   - Ogni componente che carica o elabora dati deve implementare i 4 stati:
     1. *Loading State*: Skeleton loader ad animazione shimmer (mai spinner isolati che disorientano).
     2. *Empty State*: Grafica pulita, messaggio contestuale chiaro e invito all'azione per iniziare.
     3. *Error State*: Indicazione esatta del problema con possibilità di riprovare (*Retry*).
     4. *Success / Data State*: Presentazione fluida dei dati.
3. **Accessibilità (WCAG AA)**:
   - Rispetta un rapporto di contrasto minimo di 4.5:1 per il testo normale e 3:1 per il testo grande.
   - Tutti i controlli interattivi devono essere navigabili tramite tastiera con `focus-visible:ring-2` evidente.

---

## 4. Dual-Theme, Stack Blade/Tailwind v4, HTML Standalone & Print (Estensione v4.0.0)

1. **Light Mode Istituzionale & Semantica Anti-Daltonismo**:
   - Per portali B2B/PA/contabilità/bandi adotta superfici chiare (`bg-slate-50`, card `bg-white`, `border-slate-200`) con colore associato alla **natura della voce** (mai solo al segno +/-) e **etichette testuali obbligatorie**.
   - Separa chiaramente `Provvisorio` vs `Approvato` e applica il principio plain-language (max 4 indicatori in prima schermata, blocchi *Cosa significa* + *Cosa puoi fare*).
2. **Regole Rigide Blade + Tailwind CSS v4 + Vite 8**:
   - Quando il progetto usa `@tailwindcss/vite` (`@import 'tailwindcss'`, `@theme`), **è vietato** caricare `<script src="https://cdn.tailwindcss.com">` nelle viste Blade o usare classi interpolate dinamicamente (`bg-{{ $color }}-100`: usare mappe PHP/enum statiche complete).
3. **HTML Standalone Offline & Sicurezza DOM**:
   - Per dimostratori e dashboard single-file inlina CSS/JS localmente (zero CDN esterni), applica CSP strict con hash SHA-256, usa delegazione eventi `data-action` (zero `onclick=` inline) e vieta `.innerHTML` con dati esterni o output LLM (rischio XSS).
4. **Mobile Touch/PWA & Stampa A4**:
   - Input mobile con `font-size >= 16px` (anti-zoom iOS), rispetto `safe-area-inset-bottom` e stili `@media print` dedicati per report e schede operative.

---

## 5. Direzione Artistica Multi-Stile, Tipografia d'Autore & Pipeline Visual-First (Estensione v4.1.0)

> **Riferimento Operativo**: Skill `creative-ui-art-direction` (`skills/creative-ui-art-direction/SKILL.md`).

1. **Divieto di Mono-Cultura Visiva**:
   - La palette `Zinc 950 (#09090b) + Cyan` è **solo una delle opzioni** (stile dev/terminal), NON il template unico di default. Prima di scrivere CSS, `@steve` sceglie la direzione estetica più coerente con il dominio tra almeno **6 archetipi moderni** (*Obsidian Precision*, *Swiss Editorial Paper*, *Warm Analog Tactile*, *Alabaster Soft-Depth*, *Editorial Magazine Bold*, *Technical Blueprint*), adottando la regola cromatica **60/30/10** in spazio **OKLCH** con superfici stratificate e un solo colore firma intenzionale.
2. **Tipografia Moderna & Whitespace Strutturale**:
   - Titoli espressivi con `tracking-tight` / `-0.03em`, scala fluida (`clamp()`), abbinamenti Display/Serif + UI Sans + Monospace con `font-variant-numeric: tabular-nums` obbligatorio su KPI, prezzi e timestamp live.
   - Usa lo spazio negativo (`whitespace`) come elemento strutturale per dare respiro ed eleganza anziché riempire ogni pixel di bordi e card.
3. **Arte Vettoriale SVG, Micro-Texture & Motion Physics**:
   - Preferisci connettori Bézier, grafici SVG parametrici e icone vettoriali coerenti al posto di box spessi o sole emoji di sistema; su animazioni SVG imposta `transform-box: fill-box; transform-origin: center;`.
   - Motion fluida (`cubic-bezier(0.22, 1, 0.36, 1)`), animazioni incrementali nei feed SSE live (senza distruggere nodi esistenti o pacchetti in volo) e rispetto rigoroso di `prefers-reduced-motion`.
4. **Pipeline Visual-First Obbligatoria**:
   - **Ispirazione reale**: quando disponibili, consulta riferimenti UI reali (**Mobbin MCP**), token/frame (**Figma MCP**) o asset visivi (**Canva MCP**).
   - **Mostra, non descrivere**: prima di restyling o interfacce nuove, genera anteprime visive con **`image-generator`** (in carosello) o widget interattivi con **`generative_ui`**, e verifica il render reale su desktop/mobile tramite il subagente **`browser`**.

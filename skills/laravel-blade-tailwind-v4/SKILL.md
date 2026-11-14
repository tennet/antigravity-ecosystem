---
name: laravel-blade-tailwind-v4
description: Standard per frontend Laravel Blade con Tailwind CSS v4 (@tailwindcss/vite), Vite 8, Alpine.js, supporto Dual-Theme (Dark Tech e Light Istituzionale PMI), accessibilità anti-daltonismo, PWA mobile e stili @media print.
---

# Laravel Blade + Tailwind CSS v4 + Vite 8

## 1. Regole CSS-First di Tailwind v4
1. Verifica `package.json` e `vite.config.js`: quando è installato `@tailwindcss/vite`, il CSS usa `@import "tailwindcss";`, `@theme { ... }` e `@source` (niente `tailwind.config.js` v3).
2. **Divieto assoluto** di caricare `<script src="https://cdn.tailwindcss.com">` nelle viste Blade di un progetto configurato con Vite/Tailwind v4.
3. **Divieto assoluto** di classi dinamiche interpolate in Blade (es. `bg-{{ $color }}-100`): Tailwind v4 le esclude in build. Usa sempre mappe complete PHP/Enum/match (`'ok' => 'bg-emerald-100 text-emerald-800'`).
4. Evita utility rimosse in v4 (`bg-opacity-*` → `bg-black/50`, `flex-shrink-0` → `shrink-0`, `overflow-ellipsis` → `text-ellipsis`) e preferisci `gap-*` a `space-x/y-*`.

## 2. Dual-Theme & Semantica PMI
- **Dark Tech**: `#09090b` / `#0b0f19`, card `bg-white/[0.03] border-white/10`, glow discreti.
- **Light Istituzionale (PMI/PA/Contabilità)**: `bg-slate-50`, card `bg-white border-slate-200`, stato distinto da `Provvisorio` vs `Approvato`, colore legato alla **natura della voce** (mai solo segno +/-) con **etichetta testuale obbligatoria** (anti-daltonismo).

## 3. Mobile PWA & Stampa A4
- Input form su mobile con `font-size: 16px` (`text-base`) per evitare lo zoom forzato su iOS.
- Rispetta `env(safe-area-inset-bottom)` nelle navigation bar mobile.
- Includi `@media print` dedicato (`print:hidden` su sidebar/nav, colori leggibili su carta bianca A4) per report e schede consulenza.
- Ricorda sempre di compilare con `npm run build` prima di verificare le viste in produzione.

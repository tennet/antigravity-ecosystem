# 🤖 Canone 10 — Sistemi AI/LLM, Grounding, Ecosistema Google Gemini & Evals Deterministiche

> **Custode**: `ai-systems-engineer` (`@andrej` / `@karpathy`)  
> **Versione**: v4.1.0  
> **Ambito**: Integrazioni multi-provider (Google Gemini, OpenAI, Claude, modelli locali), ecosistema Google AI, grounding web, embedding vettoriali e valutazione della qualità.

---

## 1. Architettura Multi-Provider & Disaccoppiamento Asincrono

1. **Astrazione Unificata (`ProviderInterface` + `ProviderFactory`)**:
   - Nessun controller o comando deve parlare direttamente con SDK/endpoint grezzi di un singolo fornitore.
   - Ogni provider restituisce un DTO normalizzato (es. `ProviderObservation`) contenente: `provider`, `model`, `status`, `is_degraded`, `grounding_mode`, `response_text`, `citations[]`, `usage` (`input_tokens`, `output_tokens`, `cost_estimate`) e `payload_sha256`.
2. **Divieto di Chiamate LLM Sincrone Lente**:
   - Timeout di rete elevati (es. `30s–120s`) non devono mai bloccare un worker HTTP FPM/web in una richiesta sincrona.
   - Le elaborazioni di audit/analisi vanno eseguite tramite **Queue/Jobs asincroni**, restituendo subito un `job_id` / stato `queued` osservabile via polling o SSE.
3. **Idempotenza & Budget Control**:
   - Calcola sempre una chiave idempotente deterministica (`tenant_id + provider + prompt_hash + repetition_index`) per evitare doppie esecuzioni costose.
   - Applica rate limiting (`throttle`), circuit breaker su HTTP `429`/`5xx` con backoff esponenziale + jitter e tetti di budget token giornalieri per tenant.

---

## 2. Trasparenza del Grounding & Prevenzione Schema Drift

1. **Divieto Assoluto di Fallback Opachi**:
   - Se un provider primario fallisce o l'ambiente è offline, eventuali fallback euristici/locali devono impostare esplicitamente `is_degraded = true` e `grounding_mode = 'synthetic_fallback'` (o `'degraded'`).
   - È vietato conteggiare un fallback sintetico come risultato live negli score di visibilità, dashboard o audit clienti.
2. **Rilevazione dello Schema Drift**:
   - Distingui un payload API valido ma senza citazioni da una risposta il cui formato JSON è cambiato (es. assenza delle chiavi attese `candidates`/`groundingMetadata` o `output`/`annotations`): in caso di mismatch strutturale, logga un warning strutturato e marca il run come `schema_mismatch` anziché restituire silenziosamente `score = 0`.
3. **Sanitizzazione & Delimitazione**:
   - Separa sempre `system_instructions` dal contenuto untrusted tramite delimitatori/nonce e forza **Structured Outputs / JSON Schema** quando il risultato alimenta calcoli o database.

---

## 3. Testabilità Deterministica & Offline Evals

1. **Zero Traffico di Rete Reale nei Test Automatizzati**:
   - Ogni suite di test che tocca provider AI deve attivare guardie di isolamento (`Http::preventStrayRequests()` in Laravel o transport mock equivalente in Python/Node).
   - I parser dei provider devono essere testati con **Golden JSON Fixtures** rappresentative di risposte reali, risposte vuote, `429`, `500` e payload malformati.
2. **Offline Eval Harness**:
   - Ogni pipeline di scoring o estrazione AI deve mantenere un dataset fisso di casi di riferimento (*golden prompts/documents*) per misurare prima del rilascio:
     - **Schema Compliance Rate** (% risposte conformi allo schema atteso);
     - **Citation / Grounding Accuracy** (assenza di URL inventati o domini fuori whitelist);
     - **Consistenza su $N$ ripetizioni** (varianza dello score entro soglia tollerata).

---

## 4. Matrice Operativa & Competenze Ecosistema Google Gemini / Google AI

Questa sezione codifica le competenze specialistiche dell'agente `@andrej` (alias di `ai-systems-engineer` / `@karpathy`) sull'intero ventaglio di modelli, servizi, limiti operativi e quote dell'ecosistema **Google AI e Gemini**.

### 4.1 Modelli e App Gemini

| Componente | Dettaglio Operativo & Capacità |
| :--- | :--- |
| **Gemini app** | Accesso a **Gemini 4 Argon**, **Gemini 3.1 Pro** e modelli **Flash**; context window fino a **1M token**; **4x limiti Free** su frequenza e throughput. |
| **Deep Research** | Ricerche autonome multi-step con esplorazione di fonti eterogenee e generazione di report documentati e citati. |
| **Tasks in Gemini** | Agente autonomo (ex Spark) per l'esecuzione di compiti asincroni complessi e pianificazione di flussi. |
| **Daily Brief** | Riassunti giornalieri personalizzati aggregati da fonti multiple e context aziendale. |
| **Canvas** | Ambiente interattivo di editing collaborativo in tempo reale su testo e codice sorgente con supporto diffing. |
| **Gems** | Creazione e orchestrazione di assistenti personalizzati con system prompt verticali e ruoli dedicati. |
| **Gemini Live** | Conversazione vocale e multimodale bidirezionale a bassissima latenza. |
| **Veo 3.1 Lite** | Generazione video AI cinematografica (trial limitato integrato). |
| **Nano Banana** | Generazione e manipolazione di immagini ad alta fedeltà con capacità multimodali native. |

### 4.2 Ricerca e Conoscenza Aumentata

| Componente | Dettaglio Operativo & Capacità |
| :--- | :--- |
| **Gemini Notebook (ex NotebookLM)** | Fino a **500 notebook**, **300 sorgenti/notebook**; generazione di **20 Audio Overviews/giorno**, **20 Video Overviews** (incluse **2 cinematiche**); **esecuzione codice nativa (Cloud Computer sandbox)**; sintesi automatica di **quiz, flashcard e mappe mentali**. |
| **AI Mode in Google Search** | Modello **Gemini 4 Argon** in modalità AI con **Nano Banana** e capacità agentiche native per sintesi e ricerca web potenziata. |
| **Auto browse in Chrome** | Navigazione e interazione autonoma tramite Gemini per compilazione form, discovery e web automation. |
| **Gemini in Google Earth** | Limiti operativi più alti per analisi geospaziale avanzata e modelli territoriali (solo USA). |

### 4.3 Workspace e Produttività

| Componente | Dettaglio Operativo & Capacità |
| :--- | :--- |
| **Gemini in Gmail, Docs, Sheets, Slides, Vids, Drive** | Sidebar AI completa integrata: stesura intelligente, riassunti di conversazioni/documenti, analisi dati e formule su fogli, storyboard e video automation su Vids. |
| **Gemini in Android Studio** | Integrazione IDE nativa per lo sviluppo Android: scaffolding Kotlin/Compose, ottimizzazione layout, code completion, profiling e test generation. |

### 4.4 Sviluppo e Coding

| Componente | Dettaglio Operativo & Capacità |
| :--- | :--- |
| **Google Antigravity** | Piattaforma agentica: limiti operativi più alti, traffico prioritizzato, accesso ai modelli agent avanzati e orchestrazione team di sub-agenti. |
| **Jules** | Agente di coding asincrono con limiti espansi: gestione autonoma di issue, refactoring di repository e apertura di PR. |
| **Google AI Studio** | Ambiente di sviluppo per prototipazione rapida di prompt, configurazione Structured Outputs, fine-tuning e gestione API Keys. |
| **Google Colab** | Quota di **200 compute unit/mese** per notebook interattivi, calcolo GPU/TPU, benchmark ed esecuzione script ML/AI. |
| **Google Developer Program Premium** | **$10/mese in crediti Google Cloud** per provisioning di risorse serverless, storage, Secret Manager e servizi API. |

### 4.5 Creatività & Multimodal Studio

| Componente | Dettaglio Operativo & Capacità |
| :--- | :--- |
| **Google Flow** | Creative Studio potenziato con **1.000 Flow Credits/mese** (Gemini Omni Flash, generazione di scene cinematografiche e tool custom). |
| **Google Flow Music** | Generazione ed editing musicale algoritmico con controlli timbrici e stilistici. |
| **Google TV Create Hub** | Hub di creazione multimediale per smart TV e display ambientali (solo USA). |
| **Google Photos Generative AI** | Limiti più alti per feature avanzate: **Photo to Video**, Magic Eraser e **Remix** generativo. |

### 4.6 Benefit Extra & Quota Infrastrutturale

| Componente | Dettaglio Operativo & Capacità |
| :--- | :--- |
| **Storage Cloud** | **5 TB** di spazio unificato condiviso su Gmail, Google Drive e Google Photos. |
| **YouTube Premium Lite** | Meno pubblicità, background play e download offline (esclusi musica e Shorts). |
| **Google Health Premium** | Funzionalità avanzate di monitoraggio sanitario e report predittivi. |
| **Google Home Premium Standard** | **30 giorni di cronologia video eventi**, alert intelligenti avanzati e **Gemini Live hands-free** sui dispositivi smart home. |
| **Dreambeans / Playground** | Ambienti sperimentali di generazione concettuale e playground interattivo (solo USA). |
| **Family Sharing** | Condivisione delle quote e dei benefit di sistema fino a **5 membri aggiuntivi**. |

---

## 5. Regole di Routing & Deleghe per `@andrej`:
- **Task di ricerca complessa / review bibliografica**: attivare **Deep Research** o **Gemini Notebook (ex NotebookLM)** sfruttando le 300 sorgenti e l'esecuzione di codice cloud computer.
- **Task di coding asincrono / refactoring di repository**: delegare a **Jules** o ad **Antigravity** sfruttando la priorità di banda e i limiti estesi.
- **Task di prototipazione prompt & structured outputs**: configurare su **Google AI Studio**, testare su **Google Colab** (200 CU/mese) e congelare le golden fixtures prima di andare in produzione.
- **Task creativi / video / audio**: orchestrare **Google Flow** (1.000 crediti), **Veo 3.1 Lite**, **Flow Music** e **Nano Banana**.

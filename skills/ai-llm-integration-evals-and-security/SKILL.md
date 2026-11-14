---
name: ai-llm-integration-evals-and-security
description: Progettazione, sicurezza OWASP LLM Top 10 ed evals per OpenAI/Gemini/Claude ed ecosistema Google AI (Argon, Pro, Flash, Deep Research, Tasks, NotebookLM, Antigravity, Jules, Flow).
---

# AI/LLM Integration, Evals & Security

## 1. Architettura & Resilienza Provider
1. Incapsula ogni modello dietro `ProviderInterface` + `ProviderFactory` con DTO normalizzato (`status`, `is_degraded`, `grounding_mode`, `usage`, `payload_sha256`).
2. **Asincronia obbligatoria**: non eseguire chiamate LLM con timeout `>5s` (es. `120s`) in controller web sincroni; usa `Queue/Jobs` asincroni con stato osservabile e idempotenza su `(tenant_id, provider, prompt_hash, repetition_index)`.
3. **Divieto di Fallback Opachi**: se un provider fallisce, il fallback (o testo sintetico offline) **deve** impostare `is_degraded = true` e `grounding_mode = 'fallback'`, escludendolo dai punteggi di produzione.
4. **Anti Schema Drift**: distingue risposta vuota valida da cambio schema JSON del provider (`candidates`/`groundingMetadata` o `output`/`annotations`) loggando l'anomalia.

## 2. Ecosistema Google Gemini & Suite Avanzata
- **Modelli**: **Gemini 4 Argon** (ragionamento e agenti), **Gemini 3.1 Pro** (complessità), **Gemini Flash** (1M token context window, 4x rate limits Free, efficienza latency/cost).
- **Tool cognitivi e di ricerca**: **Deep Research** (ricerche multi-step con report sintetizzati e citati), **Tasks in Gemini** (agente autonomo ex Spark per compiti asincroni), **Daily Brief**, **Canvas** (collaborazione real-time codice/testo), **Gems**, **Gemini Live** (audio streaming bidirezionale), **Veo 3.1 Lite** (video), **Nano Banana** (immagini).
- **Ricerca e Notebook**: **Gemini Notebook (ex NotebookLM)** (500 notebook, 300 fonti per notebook, 20 Audio Overviews/giorno, 20 Video Overviews con 2 cinematiche, Cloud Computer nativo per esecuzione codice, quiz/flashcard/mindmap), **AI Mode Search** (Gemini 4 Argon + Nano Banana con capacità agentiche), **Auto browse in Chrome**.
- **Sviluppo & Coding**: **Google Antigravity** (quote espanse, priorità traffico, modelli agent), **Jules** (coding agent asincrono), **Google AI Studio**, **Google Colab** (200 compute unit/mese), **Google Developer Program Premium** ($10/mese in crediti cloud).
- **Creatività & Media**: **Google Flow** (1.000 Flow Credits/mese, Omni Flash), **Google Flow Music**, **Photos Generative AI** (Photo-to-Video, Remix).
- **Benefit e Storage**: 5 TB cloud storage unificato, YouTube Premium Lite, Google Health Premium, Google Home Premium Standard (30gg video, alert intelligenti, Live hands-free).

## 3. Sicurezza OWASP LLM Top 10
- **LLM01 (Prompt Injection)**: separa `system` da input untrusted tramite delimitatori/nonce e forza JSON Schema / Structured Outputs.
- **LLM05 (Improper Output Handling)**: **vieta `.innerHTML`** per renderizzare risposte LLM o titoli/snippet estratti dal web (usa `textContent` o sanitizer rigido).
- **LLM10 (Unbounded Consumption)**: applica sempre middleware `throttle` sulle rotte pubbliche e budget giornaliero di token/chiamate; non restituire `raw_payload` interni agli endpoint pubblici.

## 4. Evals & Test Deterministici
- Attiva `Http::preventStrayRequests()` e usa Golden JSON Fixtures registrate per tutti i test unit/feature.
- Mantieni un dataset offline fisso per misurare prima del rilascio: Schema Compliance, Citation Accuracy (nessun URL inventato) e stabilità su $N$ ripetizioni.

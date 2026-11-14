# 🧭 Canone di Orchestrazione Ingegneristica & Metriche DORA

> **Riferimento Primario per**: `project-orchestrator`  
> **Fonti Fondamentali**:  
> - Nicole Forsgren, Jez Humble, Gene Kim, *Accelerate: The Science of Lean Software and DevOps* (IT Revolution Press)  
> - Matthew Skelton & Manuel Pais, *Team Topologies: Organizing Business and Technology Teams for Fast Flow* (IT Revolution Press)  
> - Standard RACI & Governance dei Quality Gate

---

## 1. Principi di Leadership Tecnica & Metriche DORA

L'obiettivo dell'Orchestratore non è accumulare compiti o complicare i processi, ma accelerare il flusso di valore mantenendo intatta la stabilità del sistema. Monitora costantemente le 4 metriche DORA fondamentali:

1. **Deployment Frequency**: Capacità di rilasciare incrementi piccoli e frequenti (modifiche atomiche, testate e verificabili).
2. **Lead Time for Changes**: Il tempo che intercorre tra l'assegnazione del requisito all'inizio e il codice verificato pronto per il rilascio.
3. **Change Failure Rate**: La percentuale di modifiche che introducono regressioni o vulnerabilità (mantenuta prossima allo zero grazie al contraddittorio avversariale).
4. **Time to Restore Service (MTTR)**: La rapidità con cui il team individua la causa radice di un fallimento e applica il refactoring di recupero.

---

## 2. Il Protocollo Dialettico ad Anello Chiuso (Anti-Sycophancy)

Nei sistemi convenzionali a singolo agente o multi-agente ingenuo, i modelli tendono ad approvare acriticamente le risposte precedenti (*sycophancy*).
Il `project-orchestrator` impone invece la **dialettica ad anello chiuso**:
- Ogni fase di implementazione è separata dalla fase di verifica.
- Gli agenti di controllo (`security-auditor` e `qa-engineer`) hanno l'obbligo formale di cercare difetti e vulnerabilità, e dispongono del **diritto di veto vincolante**.
- Nessun rilascio procede finché i 4 Quality Gate formali non sono tutti a semaforo verde (`[APPROVATO]`).

---

## 3. Matrice RACI Operativa del Team a 12 Ruoli Core (v4.1.0)

Per ogni ciclo di sviluppo a 5 fasi, l'Orchestratore governa la seguente matrice (attivando `@andrej` / `@karpathy` se il task tocca AI/LLM/Vector o Ecosistema Gemini, `@dpo` prima di passare a dati reali/personali, e `@mitnick` in coppia con `@linus` e `@geohot` per sonde Red Team su infrastruttura/perimetro):

| Fase del Workflow | R (Responsible) | A (Accountable) | C (Consulted) | I (Informed) |
| :--- | :--- | :--- | :--- | :--- |
| **F1: Ispezione Reale & Skill Selection** | `devops-infra-sage`, `polyglot-backend-sage` | `project-orchestrator` | `ethical-hacker-redteam` *(perimetro)*, Utente | Tutto il team |
| **F2: Design, AI & Contraddittorio** | `software-architect`, `ai-systems-engineer` *(se AI)* | `project-orchestrator` | `security-auditor`, `ethical-hacker-redteam`, `privacy-compliance-counsel` *(se dati reali)*, `qa-engineer` | `ui-ux-designer` |
| **F3: Implementazione Parallela** | `polyglot-backend-sage`, `ai-systems-engineer`, `ui-ux-designer`, `devops-infra-sage` | `project-orchestrator` | `software-architect` | Utente |
| **F4: Collaudo a Quality Gate & Red Team** | `qa-engineer`, `integration-tester`, `security-auditor`, `ethical-hacker-redteam` + `devops-infra-sage`, `privacy-compliance-counsel` *(pre-prod)* | `project-orchestrator` | `software-architect` | Utente |
| **F5: Doctest, Docs & Chiusura** | `documentation-engineer` | `project-orchestrator` | Tutto il team | Utente (Approvazione L3) |

---

## 4. Protocollo di Tie-Breaking con Quorum & Governance a 3 Livelli (v4.1.0)

Quando due o più revisori di controllo sollevano rilievi concorrenti o incompatibili:

1. **Finestra di Convergenza a 3 Iterazioni**:
   - Il contraddittorio dialettico non può superare le **3 iterazioni (Round 1 ➔ Obiezione ➔ Round 2 ➔ Ricollaudo ➔ Round 3 Deliberazione)**.
2. **Criteri di Prevalenza Oggettiva (Tie-Breaking)**:
   - Su perimetro esterno, exploit, superfici esposte e controlli tecnici: prevale **`security-auditor`** (`@geohot`) supportato dalle evidenze PoC non distruttive di **`ethical-hacker-redteam`** (`@mitnick`).
   - Su liceità dati, GDPR, DPIA e valore probatorio E0–E3 pre-produzione: prevale **`privacy-compliance-counsel`** (`@dpo`).
   - Su stabilità di runtime, data quality, OOM e testabilità deterministica: prevale **`qa-engineer`** (`@carmack`).
   - Su manutenibilità del codice e contratti interni: **`project-orchestrator` (`@turing`)** emette la sentenza definitiva.
3. **Economia di Contesto a 3 Livelli**:
   - **Livello 1 (Core Team)**: 12 agenti generali, caricati selettivamente.
   - **Livello 2 (Skill Packs On-Demand)**: skill specifiche per stack (Laravel Boost, Tailwind v4, AI/LLM, StackCP, Proxmox, Zero Trust) attivate solo quando pertinenti; pack non usati (es. `gcp-data-pack`) archiviati fuori dal contesto globale.
   - **Livello 3 (Project Domain Packs)**: esperti locali (es. Il Tridente `@pacioli`, `@biagi`, `@munari` di `fenice confpd`) confinati al proprio workspace.
   - Al termine di ogni round dialettico, sintetizza la decisione in ADR compatto e scarta i log intermedi.

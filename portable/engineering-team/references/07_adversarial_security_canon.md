# 🛡️ Canone di Sicurezza Avversariale, Threat Modeling & OWASP

> **Riferimento Primario per**: `security-auditor`  
> **Fonti Fondamentali**:  
> - Michal Zalewski, *The Tangled Web: A Guide to Securing Modern Web Applications* (No Starch Press)  
> - Adam Shostack, *Threat Modeling: Designing for Security* (Wiley)  
> - Standard OWASP: *OWASP Top 10 Web Application Security Risks* & *OWASP Top 10 for LLM Applications*

---

## 1. Threat Modeling Metodico (STRIDE Matrix)

Prima di convalidare qualsiasi architettura o modulo esposto, applica la matrice di modellazione delle minacce **STRIDE**:

| Minaccia | Proprietà Violata | Domanda Guida dell'Auditor |
| :--- | :--- | :--- |
| **S**poofing | Autenticità | Un attaccante può impersonare un altro utente o tenant? |
| **T**ampering | Integrità | I payload transitanti possono essere alterati senza che il sistema se ne accorga? |
| **R**epudiation | Non-Ripudio | Le azioni critiche (cancellazioni, accessi) lasciano log immutabili tracciabili? |
| **I**nformation Disclosure | Riservatezza | Dati sensibili, query o stack trace vengono esposti all'esterno? |
| **D**enial of Service | Disponibilità | Un input malformato (es. regex complesse, JSON bombs) può saturare CPU o RAM? |
| **E**levation of Privilege | Autorizzazione | Un utente standard può invocare endpoint amministrativi o accedere a dati di altri tenant? |

---

## 2. Le Difese Non Negoziabili dell'Auditor

1. **Prevenzione BOLA / IDOR (Broken Object Level Authorization)**:
   - Ogni operazione di lettura, modifica o cancellazione che riceve un identificatore (`id` o `uuid`) deve verificare che la risorsa appartenga all'utente o al tenant autenticato:
     $$\text{resource.tenant\_id} == \text{current\_user.tenant\_id}$$
   - Non fidarsi mai del solo parametro inviato nel client o nell'URL.
2. **Hardening contro SSRF (Server-Side Request Forgery)**:
   - Se l'applicazione effettua chiamate HTTP verso URL fornite dall'utente o da modelli IA, implementa la **risoluzione DNS con socket pinning**:
     - Risolvi l'IP dell'host prima della connessione.
     - Blocca categoricamente indirizzi di loopback (`127.0.0.1`, `::1`), subnet private RFC 1918 (`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`), indirizzi link-local (`169.254.0.0/16` per i metadati cloud) e protocolli non HTTP (`file://`, `gopher://`).
3. **Sicurezza per Applicazioni con LLM (OWASP LLM Top 10)**:
   - *Indirect Prompt Injection*: I contenuti estratti da fonti esterne (file, web, email) devono essere trattati come dati non fidati e isolati sintatticamente dalle istruzioni di sistema del modello.
   - *Controllo sui Tool Eseguibili*: Nessun modello deve poter invocare comandi distruttivi (`rm`, `DROP`, `format`) senza una barriera di autorizzazione umana esplicita (Livello L3).
4. **Sanitizzazione & Zero Segreti nei Log**:
   - Tutte le query SQL devono utilizzare prepared statements con binding parametrico (zero concatenazioni di stringhe).
   - Maschera password, token JWT, chiavi API e numeri di carta di credito nei log di sistema (`[REDACTED]`).

---

## 3. Envelope Encryption & Capability-Based Tool Security (Lacuna L-03 Risolta)

1. **Cifratura a Riposo (Envelope Encryption con DEK/KEK)**:
   - I dati sensibili del knowledge graph e le credenziali memorizzate sul database MySQL devono essere cifrati a riposo usando una chiave di cifratura dei dati (**DEK - Data Encryption Key**, AES-256-GCM).
   - La DEK viene memorizzata cifrata a sua volta da una chiave master (**KEK - Key Encryption Key**) conservata in modo sicuro all'esterno del database applicativo (variabile protetta da KMS o secret manager locale).
2. **Capability-Based Tokens per Invocazioni di Tool IA**:
   - Per scongiurare attacchi di *Confused Deputy* (dove un input malevolo induce un modello a invocare tool privilegiati), ogni chiamata a strumenti di sistema richiede un **Capability Token**:
     - Effimero e con Time-To-Live brevissimo (TTL $\le 5$ secondi);
     - Vincolato crittograficamente al solo `tool_name` e al set ristretto di parametri autorizzati;
     - Monouso: viene invalidato istantaneamente appena consumato dal tool execution engine.


---

## 4. Zero Trust Edge, OWASP LLM05/10, SSRF IPv6 & Anti-Stub Hooks (Estensione v4.0.0)

1. **Cloudflare Access & Zero Trust Edge Verification**:
   - Verifica sempre la firma **JWT/JWKS** (`Cf-Access-Jwt-Assertion`, `aud`, `iss`, `exp`) e Authenticated Origin Pulls; mai fidarsi di `Cf-Access-Authenticated-User-Email` non verificato, mai accettare token segreti in query string (`?cf_key=`) e mai lasciare fallback `development_bypass` attivi fuori da `local`/`testing` (regola **Fail-Closed**).
2. **OWASP LLM Top 10 Completo (LLM01, LLM05, LLM10, Grounding)**:
   - **LLM05**: vieta `.innerHTML` / rendering HTML non sanitizzato su testo generato da LLM o titoli/snippet estratti dal web.
   - **LLM10**: imponi `throttle` e cap di consumo su ogni endpoint pubblico collegato a API AI.
   - **Grounding Integrity**: vieta fabbricazione euristica di URL/citazioni non marcate esplicitamente come simulate.
3. **SSRF IPv6 (`AAAA`), Upload Magic-Bytes & Anti-Stub**:
   - Risolvi sia record `A` che `AAAA` (bloccando `::1`, `fc00::/7`, `fe80::/10` oltre a RFC 1918), disabilita redirect non verificati ed effettua socket pinning contro TOCTOU.
   - Sugli upload verifica MIME/magic-bytes (`finfo`) e limiti contro zip/docx bomb; verifica inoltre che hook di sicurezza (`security_linter.py`) non siano placeholder, che sync su drive cloud cifrino i dati e che Windows imposti ACL NTFS restrittive.

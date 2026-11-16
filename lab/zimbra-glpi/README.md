# GLPI 10 + Zimbra Collaboration Suite (Email-to-Ticket Lab)

Laboratorio locale per lo sviluppo, collaudo e hardening dell'integrazione **GLPI 10** con **ZCS (Zimbra Collaboration Suite)**, con focus primario sul ricevitore IMAP **Mailgate (Email-to-Ticket)**.

---

## 🚀 Architettura del Laboratorio

| Servizio | Hostname Docker | Porta Host | Profilo | Descrizione |
| :--- | :--- | :--- | :--- | :--- |
| **GLPI 10** | `172.28.0.10` / `glpi` | `8088` (HTTP) | Sempre attivo | Web App GLPI 10 (PHP 8.2, Apache hardened `public/`, Cron Mailgate) |
| **MariaDB 10.11** | `172.28.0.11` / `mariadb` | Solo interna (`3306`) | Sempre attivo | Database con `utf8mb4`, `tzinfo` precaricato |
| **MockMail (GreenMail)** | `172.28.0.20` / `mockmail` | `3025` (SMTP), `3143` (IMAP), `3993` (IMAPS) | `mock` (Default) | Server leggero (< 150 MB RAM) con account preconfigurati |
| **Dnsmasq** | `172.28.0.53` / `dnsmasq` | Solo interna (`53`) | `zimbra` | Risolutore DNS con MX record per `lab.local` |
| **Zimbra ZCS** | `172.28.0.25` / `mail.lab.local` | `7071` (Admin), `8082` (Webmail), `2525` (SMTP), `1143` (IMAP) | `zimbra` | Suite ZCS completa (RAM min 10-12 GB) |

---

## ⚡ Modalità 1: Avvio Rapido Mock (Consigliata per TDD immediato)

Permette di testare l'apertura automatica del ticket via email con **meno di 1.5 GB di RAM**:

```bash
cd lab/zimbra-glpi
cp .env.example .env
docker compose --profile mock up -d --build
```

### Configurazione GLPI Mailgate in modalità Mock:
1. Accedi a GLPI: `http://localhost:8088` (Credenziali iniziali installazione guidata o default: `glpi` / `glpi`).
2. Vai in **Amministrazione** ➔ **Destinatari** (Receivers) ➔ Clicca su **`+`** (Aggiungi).
3. Compila la scheda:
   - **Nome**: `Ricevitore Mock Supporto`
   - **Server**: `mockmail` (oppure `172.28.0.20`)
   - **Opzioni di connessione**:
     - Tipo server: `IMAP`
     - Porta: `3143`
     - SSL: `NO` / `Nessun controllo del certificato` (o `TLS: NO`)
   - **Cartella di posta**: `INBOX`
   - **Login**: `support@lab.local`
   - **Password**: `supportpass`
4. Clicca su **Aggiungi**, quindi rientra nel ricevitore e clicca su **Recupera subito i ticket**.
5. Invia una email di test con lo script incluso:
   ```bash
   python3 scripts/send-test-email.py --port 3025
   ```
6. Rientra in GLPI nella sezione **Assistenza** ➔ **Ticket**: troverai il nuovo ticket creato automaticamente dall'email!

---

## 🏢 Modalità 2: Avvio Full Enterprise Zimbra (ZCS)

> [!WARNING]
> **Requisito Risorse**: Assicurarsi che Docker Desktop su macOS abbia assegnati almeno **12 GB di RAM** e **4 vCPU** (Impostazioni Docker Desktop ➔ *Resources*).

```bash
docker compose --profile zimbra up -d --build
```

### Monitoraggio avvio Zimbra:
L'avvio di Zimbra alla prima inizializzazione richiede circa 3-5 minuti:
```bash
docker compose logs -f zimbra
```

Una volta avviato:
- **Console Amministrazione Zimbra**: `https://localhost:7071` (Utente: `admin`, Password: `ZimbraAdmin2026!`)
- **Webmail Zimbra**: `http://localhost:8082` o `https://localhost:8444`
- Crea una casella di posta per GLPI: es. `helpdesk@lab.local`.

### Configurazione GLPI per Zimbra:
- **Server**: `mail.lab.local` (oppure `172.28.0.25`)
- **Porta**: `143` (senza SSL) oppure `993` (con SSL/TLS - disabilitando il controllo certificato per certificati self-signed)
- **Login**: `helpdesk@lab.local`
- **Password**: `<password_casella>`

---

## 🛠️ Come Funziona l'Automazione Email-to-Ticket (GLPI Mailgate Cron)

1. **Modalità CLI attiva**: Il container `glpi` ha un demone cron di sistema (`/usr/local/bin/entrypoint.sh`) che invoca `/var/www/html/glpi/front/cron.php --force=1` ogni minuto.
2. In GLPI:
   - Vai in **Configurazione** ➔ **Azioni automatiche** ➔ **`mailgate`**.
   - Imposta **Modalità di esecuzione**: `CLI`.
   - Imposta **Frequenza di esecuzione**: `1 minuto`.
   - Stato: `Attivo`.
3. Non è necessaria alcuna interazione manuale: non appena un'email arriva nella casella IMAP, GLPI crea il ticket, assegna il richiedente in base al mittente e invia le notifiche di presa in carico.

---

## 🔍 Note e Risoluzione Problemi su macOS

1. **Porta 25 in conflitto su macOS**:
   macOS include un demone Postfix di sistema che talvolta occupa la porta 25. Per questo motivo:
   - Zimbra espone l'SMTP esterno su `2525` (`localhost:2525` -> `container:25`).
   - Mockmail espone l'SMTP esterno su `3025`.
2. **Controllo DNS Zimbra superato via Dnsmasq**:
   ZCS fallisce l'avvio se il record DNS MX del dominio `lab.local` non punta all'IP del server stesso. Il container `dnsmasq` (IP fisso `172.28.0.53`) risolve nativamente `mx-host=lab.local,mail.lab.local,10`, permettendo a ZCS di superare il bootstrap senza errori.
3. **Avviso Timezone MariaDB su GLPI**:
   Lo script `mariadb/initdb.d/01-tzinfo.sh` popola preventivamente la tabella `mysql.time_zone_name`, eliminando il classico avviso giallo di GLPI durante l'installazione.

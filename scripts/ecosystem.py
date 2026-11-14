#!/usr/bin/env python3
"""
scripts/ecosystem.py — Antigravity Engineering Ecosystem Unified CLI (v5.0.0 / Master Blueprint v5.0)
Governa l'intero ecosistema con una singola interfaccia deterministica e cross-platform:
  - test: Esegue in sequenza linter, hook test, doctest e server node:test
  - start: Avvia Mission Control (Live o Studio) con bind fail-closed (127.0.0.1 o --lan)
  - status: Diagnostica ambiente, porte, runtime e stato git
  - sync: Sincronizzazione cross-platform (macOS / Windows 11)
  - memory: Consolidamento e scrubbing PII della memoria con Google Drive
  - doctor: Diagnostica approfondita dell'ambiente locale e requisiti operativi (@linus)
  - tokens: Modello economico, model tiering, thinking budget ed estimazione caching (@andrej & @linus)
"""

from __future__ import annotations

import argparse
import json
import os
import platform
import re
import shutil
import subprocess
import sys
import urllib.error
import urllib.request
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent


def _is_color_supported() -> bool:
    if os.environ.get("NO_COLOR"):
        return False
    if not hasattr(sys.stdout, "isatty") or not sys.stdout.isatty():
        return False
    if platform.system() == "Windows":
        return os.environ.get("WT_SESSION") is not None or "ANSI" in os.environ.get("TERM", "")
    return True


USE_COLOR = _is_color_supported()


def mark_ok(msg: str) -> str:
    return f"\033[32m✔\033[0m {msg}" if USE_COLOR else f"[PASS] ✔ {msg}"


def mark_warn(msg: str) -> str:
    return f"\033[33m⚠\033[0m {msg}" if USE_COLOR else f"[WARN] ⚠ {msg}"


def mark_fail(msg: str) -> str:
    return f"\033[31m✖\033[0m {msg}" if USE_COLOR else f"[FAIL] ✖ {msg}"


def print_banner() -> None:
    print("=" * 68)
    print(" 🚀 Antigravity Engineering Ecosystem — Unified CLI (v5.0.0)")
    print("    Alan Turing (@turing) & Engineering Team Canonical Suite")
    print("=" * 68)


def cmd_test(args: argparse.Namespace) -> int:
    """Esegue tutti i test di regressione in sequenza unificata."""
    print("[TEST GATE @carmack & @rauch] Avvio suite completa di test...\n")
    steps: list[tuple[str, list[str]]] = [
        ("Security Linter (@geohot)", [sys.executable, str(REPO_ROOT / "scripts" / "hooks" / "security_linter.py")]),
        ("Python Hooks & PII Scrubbing (@dpo)", [sys.executable, "-m", "unittest", str(REPO_ROOT / "scripts" / "hooks" / "test_hooks.py")]),
        ("Multi-Node Sync Chaos Test (@linus & @carmack)", [sys.executable, str(REPO_ROOT / "scripts" / "chaos_sync_test.py")]),
        ("Offline Eval Runner (@carmack & @andrej)", [sys.executable, str(REPO_ROOT / "scripts" / "evals" / "eval_runner.py")]),
        ("Eval Runner Unit Tests (@carmack)", [sys.executable, "-m", "unittest", str(REPO_ROOT / "scripts" / "evals" / "test_eval_runner.py")]),
        ("Docs-as-Code Doctest Gate (@guido)", [sys.executable, str(REPO_ROOT / "scripts" / "doctest_docs.py")]),
        ("Mission Control Node.js Real Sockets (@rauch)", ["node", "--test", str(REPO_ROOT / "server" / "server.test.mjs")]),
    ]
    if (REPO_ROOT / "server" / "studio_server.test.mjs").is_file():
        steps.append(("Mission Control Studio Server & Mock DOM (@rauch)", ["node", "--test", str(REPO_ROOT / "server" / "studio_server.test.mjs")]))

    failed = False
    for title, cmd in steps:
        print(f"--- ▶ Esecuzione: {title} ---")
        res = subprocess.run(cmd, cwd=str(REPO_ROOT))
        if res.returncode != 0:
            print(f"[FAIL] ❌ {title} fallito con codice {res.returncode}.\n")
            failed = True
            if not args.keep_going:
                return 1
        else:
            print(f"[PASS] ✔ {title} completato con successo.\n")

    if failed:
        print("[RISULTATO] ❌ Almeno un test non e' passato. Correggere i rilievi prima del rilascio.")
        return 1
    print("[RISULTATO] ✅ Tutti i test sono passati con successo (Quorum Carmack/Rauch OK).")
    return 0


def cmd_start(args: argparse.Namespace) -> int:
    """Avvia il server Mission Control."""
    host = "0.0.0.0" if args.lan else "127.0.0.1"
    port = str(args.port)
    server_file = "mission_control_studio_server.mjs" if args.studio else "mission_control_server.mjs"
    server_path = REPO_ROOT / "server" / server_file

    if not server_path.is_file():
        print(f"[ERROR] File server non trovato: {server_path}", file=sys.stderr)
        return 1

    print("\n--- 🛰️ Avvio Mission Control ---")
    if args.lan:
        print("[AVVISO SICUREZZA - @mitnick & @geohot] Modalita' LAN abilitata (0.0.0.0).")
        print("                                         Il server e' raggiungibile da tutta la sottorete locale.")
    else:
        print("[SICUREZZA] Bind isolato su loopback (127.0.0.1). Nessuna esposizione Wi-Fi.")
        print("            Usa '--lan' per consentire l'accesso da altri dispositivi.")

    env = dict(os.environ)
    env["HOST"] = host
    env["PORT"] = port
    env["NODE_ENV"] = env.get("NODE_ENV", "development")

    if getattr(args, "open", False):
        def _open_browser() -> None:
            import time
            time.sleep(0.6)
            target_url = f"http://127.0.0.1:{port}"
            try:
                if platform.system() == "Darwin":
                    subprocess.Popen(["open", target_url])
                elif platform.system() == "Windows":
                    subprocess.Popen(["cmd", "/c", "start", target_url], shell=True)
                else:
                    subprocess.Popen(["xdg-open", target_url])
            except Exception:
                pass
        import threading
        threading.Thread(target=_open_browser, daemon=True).start()

    cmd = ["node", str(server_path)]
    try:
        res = subprocess.run(cmd, env=env, cwd=str(REPO_ROOT))
        return res.returncode
    except KeyboardInterrupt:
        print("\n[INFO] Chiusura server richiesta dall'utente.")
        return 0


def cmd_status(args: argparse.Namespace) -> int:
    """Verifica lo stato generale dell'ecosistema e la salute dei server."""
    print_banner()
    print(f"Platform:      {platform.system()} ({platform.machine()})")
    print(f"Python:        {platform.python_version()} ({sys.executable})")

    # Node check
    try:
        node_ver = subprocess.check_output(["node", "--version"], text=True).strip()
        print(f"Node.js:       {node_ver}")
    except (OSError, subprocess.CalledProcessError):
        print("Node.js:       NON TROVATO")

    # Git check
    try:
        git_branch = subprocess.check_output(["git", "branch", "--show-current"], cwd=str(REPO_ROOT), text=True).strip()
        git_status = subprocess.check_output(["git", "status", "--short"], cwd=str(REPO_ROOT), text=True).strip()
        untracked_count = len([line for line in git_status.splitlines() if line.startswith("??")])
        modified_count = len([line for line in git_status.splitlines() if not line.startswith("??") and line.strip()])
        print(f"Git Branch:    {git_branch}")
        print(f"Git Modifiche: {modified_count} file modificati, {untracked_count} non tracciati")
    except (OSError, subprocess.CalledProcessError):
        print("Git:           Errore nel recupero dello stato")

    # Probe porta 8787
    port = args.port or 8787
    url = f"http://127.0.0.1:{port}/healthz"
    print(f"\nVerifica server su {url}...")
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "EcosystemCLI/5.0.0"})
        with urllib.request.urlopen(req, timeout=1.5) as resp:
            if resp.status == 200:
                body = json.loads(resp.read().decode("utf-8"))
                print(f"[ONLINE] ✔ Server attivo (Stato: {body.get('status')}, Uptime: {body.get('uptime_s')}s, Client SSE: {body.get('sse_clients')})")
            else:
                print(f"[WARN] Risposta non 200: HTTP {resp.status}")
    except urllib.error.URLError:
        print(f"[OFFLINE] Nessun server in ascolto su 127.0.0.1:{port}.")

    return 0


def cmd_sync(args: argparse.Namespace) -> int:
    """Esegue lo script di allineamento simmetrico multipiattaforma."""
    is_windows = platform.system() == "Windows"
    if is_windows:
        script = REPO_ROOT / "scripts" / "sync.ps1"
        cmd = ["pwsh", "-File", str(script)]
    else:
        script = REPO_ROOT / "scripts" / "sync.sh"
        cmd = ["bash", str(script)]

    print(f"[SYNC @linus] Avvio sincronizzazione: {' '.join(cmd)}")
    res = subprocess.run(cmd, cwd=str(REPO_ROOT))
    return res.returncode


def cmd_memory(args: argparse.Namespace) -> int:
    """Esegue consolidamento e scrubbing PII della memoria su Google Drive."""
    script = REPO_ROOT / "scripts" / "hooks" / "unify_memory.py"
    cmd = [sys.executable, str(script)]
    if args.project:
        cmd.extend(["--project", args.project])
    print(f"[MEMORY @dpo & @taylor] Consolidamento memoria con scrubbing PII attivo...")
    res = subprocess.run(cmd, cwd=str(REPO_ROOT))
    return res.returncode


def cmd_eval(args: argparse.Namespace) -> int:
    """Esegue l'harness di valutazione offline deterministica a zero-token."""
    script = REPO_ROOT / "scripts" / "evals" / "eval_runner.py"
    cmd = [sys.executable, str(script)]
    res = subprocess.run(cmd, cwd=str(REPO_ROOT))
    return res.returncode


def cmd_cache(args: argparse.Namespace) -> int:
    """Governa il bundle di Context Caching e l'integrazione Google Gemini (@andrej)."""
    script = REPO_ROOT / "scripts" / "cache_manager.py"
    action = args.action or "status"
    cmd = [sys.executable, str(script), action]
    res = subprocess.run(cmd, cwd=str(REPO_ROOT))
    return res.returncode


def cmd_doctor(args: argparse.Namespace) -> int:
    """Diagnostica approfondita dell'ambiente locale, runtime e requisiti operativi."""
    print("=" * 68)
    print(" 🩺 Antigravity Ecosystem Doctor — Diagnostica d'Ambiente (@linus)")
    print("=" * 68)

    passed_count = 0
    warn_count = 0
    fail_count = 0

    # 1. Python Check
    print("\n--- 🐍 Runtime Python ---")
    py_ver = sys.version_info
    py_str = platform.python_version()
    if py_ver >= (3, 10):
        print(mark_ok(f"Python {py_str} (>= 3.10) [Interprete: {sys.executable}]"))
        passed_count += 1
    else:
        print(mark_fail(f"Python {py_str} obsoleto (< 3.10 richiesto per type annotations e pattern matching)"))
        fail_count += 1

    # 2. Node.js Check
    print("\n--- 🟢 Runtime Node.js ---")
    node_found = False
    try:
        res = subprocess.run(["node", "--version"], capture_output=True, text=True, timeout=4)
        if res.returncode == 0:
            raw_node = res.stdout.strip()
            node_found = True
            m = re.search(r"v?(\d+)\.", raw_node)
            if m:
                major = int(m.group(1))
                if major >= 18:
                    print(mark_ok(f"Node.js {raw_node} (>= 18) [Supporto nativo node:test & ESM]"))
                    passed_count += 1
                else:
                    print(mark_fail(f"Node.js {raw_node} obsoleto (< 18 richiesto per test runner nativo e ESM)"))
                    fail_count += 1
            else:
                print(mark_ok(f"Node.js presente: {raw_node}"))
                passed_count += 1
    except (FileNotFoundError, subprocess.TimeoutExpired, OSError):
        pass

    if not node_found:
        print(mark_fail("Node.js non trovato nel PATH (richiesto >= 18 per Mission Control e server node:test)"))
        fail_count += 1

    # 3. Docker & Daemon Check
    print("\n--- 🐳 Docker & Container Engine ---")
    docker_bin = shutil.which("docker")
    if not docker_bin:
        print(mark_warn("Docker non trovato nel PATH (consigliato per container multi-arch e test isolati)"))
        warn_count += 1
    else:
        docker_ver = "presente"
        try:
            res_v = subprocess.run(["docker", "--version"], capture_output=True, text=True, timeout=3)
            if res_v.returncode == 0:
                docker_ver = res_v.stdout.strip()
        except Exception:
            pass

        daemon_ok = False
        try:
            res_d = subprocess.run(["docker", "info"], capture_output=True, text=True, timeout=4)
            if res_d.returncode == 0:
                daemon_ok = True
        except Exception:
            pass

        if daemon_ok:
            print(mark_ok(f"Docker attivo ({docker_ver}, daemon in esecuzione)"))
            passed_count += 1
        else:
            print(mark_warn(f"Docker presente ({docker_ver}) ma daemon non in esecuzione (avviare Docker Desktop o dockerd)"))
            warn_count += 1

    # 4. Git Check
    print("\n--- 📦 Controllo di Versione Git ---")
    if not (REPO_ROOT / ".git").exists():
        print(mark_fail("Directory .git non trovata: il workspace corrente non e' un repository Git"))
        fail_count += 1
    else:
        branch = "sconosciuto"
        try:
            res_b = subprocess.run(["git", "branch", "--show-current"], cwd=str(REPO_ROOT), capture_output=True, text=True, timeout=3)
            if res_b.returncode == 0:
                branch = res_b.stdout.strip() or "HEAD staccata"
        except Exception:
            pass

        untracked_secrets: list[str] = []
        try:
            res_s = subprocess.run(["git", "status", "--porcelain"], cwd=str(REPO_ROOT), capture_output=True, text=True, timeout=4)
            if res_s.returncode == 0:
                for line in res_s.stdout.splitlines():
                    if line.startswith("??"):
                        raw_fname = line[3:].strip().strip('"')
                        p = Path(raw_fname)
                        name_lower = p.name.lower()
                        if (name_lower.startswith(".env") and not name_lower.endswith(".example")) or \
                           p.suffix.lower() in {".pem", ".key", ".pfx", ".p12"} or \
                           "id_rsa" in name_lower or "id_ed25519" in name_lower:
                            untracked_secrets.append(raw_fname)
        except Exception:
            pass

        if untracked_secrets:
            print(mark_fail(f"Trovati file sensibili non tracciati a rischio leak: {', '.join(untracked_secrets)}"))
            fail_count += 1
        else:
            print(mark_ok(f"Git: Branch '{branch}', nessun file sensibile non tracciato rilevato"))
            passed_count += 1

        remote_ok = False
        remotes_dict: dict[str, str] = {}
        try:
            res_r = subprocess.run(["git", "remote", "-v"], cwd=str(REPO_ROOT), capture_output=True, text=True, timeout=3)
            if res_r.returncode == 0 and res_r.stdout.strip():
                for line in res_r.stdout.splitlines():
                    parts = line.split()
                    if len(parts) >= 2 and parts[0] not in remotes_dict:
                        remotes_dict[parts[0]] = parts[1]
                if remotes_dict:
                    remote_ok = True
        except Exception:
            pass

        if remote_ok:
            remote_summary = ", ".join(f"{k} -> {v}" for k, v in remotes_dict.items())
            print(mark_ok(f"Git Remote configurato: {remote_summary}"))
            passed_count += 1
        else:
            print(mark_warn("Git: Nessun remote configurato (consigliato per backup/sincronizzazione remota)"))
            warn_count += 1

    # 5. Workspace Structure Integrity
    print("\n--- 📁 Integrità Struttura Workspace ---")
    workspace_dirs = [
        ("scripts", True, "Script di orchestrazione, sync e hook"),
        ("server", True, "Mission Control Server e test socket SSE"),
        ("portable", True, "Plugin engineering-team e canone ingegneristico"),
        ("backend", False, "Backend applicativo e migrazioni"),
        ("skills", False, "Skill packs specialistici on-demand"),
    ]
    for dir_name, is_core, desc in workspace_dirs:
        target = REPO_ROOT / dir_name
        if target.is_dir():
            print(mark_ok(f"Directory '{dir_name}/' presente ({desc})"))
            passed_count += 1
        else:
            if is_core:
                print(mark_fail(f"Directory critica '{dir_name}/' mancante! ({desc})"))
                fail_count += 1
            else:
                print(mark_warn(f"Directory '{dir_name}/' non presente ({desc})"))
                warn_count += 1

    # 6. Google Drive Memory Check
    print("\n--- 🧠 Rilevamento Memoria Google Drive ---")
    brain_path = None
    brain_desc = ""
    env_brain = os.getenv("ANTIGRAVITY_BRAIN")
    if env_brain and Path(env_brain).is_dir():
        brain_path = Path(env_brain)
        brain_desc = "da variabile d'ambiente ANTIGRAVITY_BRAIN"
    else:
        home = Path.home()
        cloud_storage = home / "Library" / "CloudStorage"
        if cloud_storage.is_dir():
            for gdrive in sorted(cloud_storage.glob("GoogleDrive-*")):
                for drive_root in ("Il mio Drive", "My Drive"):
                    candidate = gdrive / drive_root / "Antigravity_Brain"
                    if candidate.is_dir():
                        brain_path = candidate
                        brain_desc = f"macOS CloudStorage ({gdrive.name})"
                        break
                if brain_path:
                    break

        if not brain_path:
            for letter in ["G", "H", "D", "E"]:
                for drive_root in ("Il mio Drive", "My Drive"):
                    candidate_win = Path(f"{letter}:\\{drive_root}\\Antigravity_Brain")
                    if candidate_win.is_dir():
                        brain_path = candidate_win
                        brain_desc = f"Windows unità {letter}:"
                        break
                if brain_path:
                    break

        if not brain_path:
            local_fallback = home / ".gemini" / "Antigravity_Brain"
            if local_fallback.is_dir():
                brain_path = local_fallback
                brain_desc = "fallback locale (~/.gemini/Antigravity_Brain)"

    if brain_path:
        print(mark_ok(f"Google Drive Brain rilevato: {brain_path} ({brain_desc})"))
        passed_count += 1
    else:
        print(mark_warn("Google Drive Brain non rilevato (configurare ANTIGRAVITY_BRAIN o montare Google Drive)"))
        warn_count += 1

    # 7. Execution Permissions & LF Endings Check
    print("\n--- 🛡️ Permessi di Esecuzione & Script Cross-Platform ---")
    is_windows = platform.system() == "Windows"
    if is_windows:
        ps_sync = REPO_ROOT / "scripts" / "sync.ps1"
        if ps_sync.is_file():
            print(mark_ok(f"Script PowerShell 7+ presente e accessibile: {ps_sync.name}"))
            passed_count += 1
        else:
            print(mark_warn(f"Script PowerShell {ps_sync.name} non trovato in scripts/"))
            warn_count += 1
    else:
        scripts_to_check = [
            REPO_ROOT / "ecosystem",
            REPO_ROOT / "scripts" / "ecosystem.py",
            REPO_ROOT / "scripts" / "sync.sh",
        ]
        perm_issues: list[str] = []
        crlf_issues: list[str] = []

        for s_path in scripts_to_check:
            if s_path.is_file():
                if not os.access(s_path, os.X_OK):
                    perm_issues.append(s_path.name)
                try:
                    raw = s_path.read_bytes()[:2048]
                    if b"\r\n" in raw:
                        crlf_issues.append(s_path.name)
                except Exception:
                    pass

        if perm_issues:
            print(mark_warn(f"Permessi di esecuzione mancanti su: {', '.join(perm_issues)} (eseguire: chmod +x {' '.join(perm_issues)})"))
            warn_count += 1
        elif crlf_issues:
            print(mark_warn(f"Terminatori CRLF rilevati in script shell POSIX: {', '.join(crlf_issues)} (richiesto LF per Canone 03)"))
            warn_count += 1
        else:
            print(mark_ok("Permessi di esecuzione (+x) e terminatori LF conformi su tutti gli script shell"))
            passed_count += 1

    # Riepilogo finale
    print("\n" + "=" * 68)
    summary_color = "\033[32m" if fail_count == 0 else "\033[31m"
    reset = "\033[0m" if USE_COLOR else ""
    status_label = "SISTEMA OPERATIVO CONFORME" if fail_count == 0 else "ANOMALIE BLOCCANTI RILEVATE"
    print(f" {summary_color}Riepilogo Doctor: {passed_count} controlli superati, {warn_count} avvisi, {fail_count} errori{reset}")
    print(f" {summary_color}Esito Finale: [{status_label}]{reset}")
    print("=" * 68)

    return 1 if fail_count > 0 else 0


def cmd_tokens(args: argparse.Namespace) -> int:
    """Report sintetico del modello economico, model tiering, thinking budget e stima context caching."""
    print("=" * 78)
    print(" 🧠 Antigravity Ecosystem Token Economics & Model Tiering (@andrej & @linus)")
    print("=" * 78)

    # 1. Model Tiering a 4 Livelli
    print("\n--- 📊 TABELLA MODEL TIERING A 4 LIVELLI ---")
    tier_rows = [
        ("Tier 0", "AST / Regex Locali", "< 10ms", "$0.00 (0 tok)", "Security Linter, Doctest Gate, AST parser"),
        ("Tier 1", "Gemini Flash (2.5/3.0)", "150-300ms", "$0.075 / $0.30", "Triage, routing rapido, classificazione, streaming"),
        ("Tier 2", "Gemini 3.1 Pro", "500ms-2s", "$1.25 / $5.00", "Ingegneria avanzata, refactoring, audit, architecture"),
        ("Tier 3", "Gemini 4 Argon / Jules", "Async/Multi", "$2.50 / $10.00", "Agenti autonomi, Deep Research, task multi-step"),
    ]
    header = f"{'TIER':<8} | {'MODELLO / ENGINE':<24} | {'LATENZA':<11} | {'COSTO / 1M (IN/OUT)':<20} | {'AMBITO OPERATIVO'}"
    print("-" * len(header))
    print(header)
    print("-" * len(header))
    for t_id, model, lat, cost, scope in tier_rows:
        print(f"{t_id:<8} | {model:<24} | {lat:<11} | {cost:<20} | {scope}")
    print("-" * len(header))
    print("(*) Nota costi di listino Google AI / Vertex per 1M token (Input standard / Output standard).")

    # 2. Preset Raccomandati per Thinking Budget
    print("\n--- 💡 PRESET RACCOMANDATI THINKING BUDGET ---")
    budget_rows = [
        ("Budget 0 (Off)", "0 token", "Output strutturati (JSON/RFC 7807), triage, classificazione, format"),
        ("Budget Standard", "1024 - 2048 token", "Refactoring di routine, unit test TDD, bug reproduction, analisi codice"),
        ("Budget Deep", "4096 - 8192 token", "Security audit avversariale, contratti distribuiti, architetture complesse"),
    ]
    b_header = f"{'PRESET BUDGET':<18} | {'BUDGET TOKEN':<18} | {'CASI D\'USO RACCOMANDATI'}"
    print("-" * len(b_header))
    print(b_header)
    print("-" * len(b_header))
    for p_name, p_tok, p_use in budget_rows:
        print(f"{p_name:<18} | {p_tok:<18} | {p_use}")
    print("-" * len(b_header))
    print("(*) I token di Thinking sono fatturati al costo di output del modello target.")

    # 3. Calcolo Stima Token Canone Ingegneristico Locale & Context Caching
    print("\n--- 📚 STIMA TOKEN CANONE INGEGNERISTICO LOCALE & CONTEXT CACHING ---")
    references_dir = REPO_ROOT / "portable" / "engineering-team" / "references"
    total_chars = 0
    total_words = 0
    total_lines = 0
    total_tokens = 0
    file_stats: list[tuple[str, int, int, int, int]] = []

    if references_dir.is_dir():
        for md_file in sorted(references_dir.glob("*.md")):
            try:
                content = md_file.read_text(encoding="utf-8", errors="ignore")
                lines = content.count("\n") + 1
                words = len(content.split())
                chars = len(content)
                est_tokens = int(chars / 3.8)
                file_stats.append((md_file.name, lines, words, chars, est_tokens))
                total_lines += lines
                total_words += words
                total_chars += chars
                total_tokens += est_tokens
            except OSError:
                pass

    if file_stats:
        f_header = f"{'DOCUMENTO CANONE':<40} | {'RIGHE':<6} | {'PAROLE':<7} | {'CARATTERI':<10} | {'TOKEN (~3.8c/t)'}"
        print("-" * len(f_header))
        print(f_header)
        print("-" * len(f_header))
        for fname, l_cnt, w_cnt, c_cnt, t_cnt in file_stats:
            print(f"{fname:<40} | {l_cnt:>6} | {w_cnt:>7} | {c_cnt:>10} | {t_cnt:>14,}")
        print("-" * len(f_header))
        print(f"{'TOTALE CANONE INGEGNERISTICO':<40} | {total_lines:>6} | {total_words:>7} | {total_chars:>10} | {total_tokens:>14,}")
        print("-" * len(f_header))

        cost_no_cache_pro = (total_tokens / 1_000_000) * 1.25
        cost_with_cache_pro = (total_tokens / 1_000_000) * 0.3125
        cost_no_cache_flash = (total_tokens / 1_000_000) * 0.075
        cost_with_cache_flash = (total_tokens / 1_000_000) * 0.01875
        savings_pct = 75.0

        print("\n🔹 SIMULAZIONE IMPATTO ECONOMICO DEL CONTEXT CACHING:")
        print(f"   • Dimensione Canone Ingegneristico: ~{total_tokens:,} token di contesto statico")
        print(f"   • Costo Turno senza Cache (Gemini 3.1 Pro):  ${cost_no_cache_pro:.5f} / turno")
        print(f"   • Costo Turno con Cache Attiva (Pro Cache Read): ${cost_with_cache_pro:.5f} / turno")
        print(f"   • Costo Turno senza Cache (Gemini Flash):   ${cost_no_cache_flash:.5f} / turno")
        print(f"   • Costo Turno con Cache Attiva (Flash Read): ${cost_with_cache_flash:.5f} / turno")
        print(f"   • Risparmio Economico Stimato per Turno:     ~{savings_pct:.1f}% - 80.0%")
        print(f"   • Riduzione Latenza Time-to-First-Token:    ~50% - 70% (layer pre-calcolati)")
    else:
        print("Cartella portable/engineering-team/references/ non trovata.")

    if getattr(args, "include_agents", False):
        agents_dir = REPO_ROOT / "portable" / "engineering-team" / "agents"
        if agents_dir.is_dir():
            ag_chars = sum(len(f.read_text(encoding="utf-8", errors="ignore")) for f in agents_dir.glob("*.md"))
            ag_tokens = int(ag_chars / 3.8)
            print(f"\n   • Profili Agenti Core (12 specialisti): ~{ag_tokens:,} token addizionali")

    # 4. Sommario Utilizzo Locale
    print("\n--- 📈 SOMMARIO UTILIZZO & SESSIONI LOCALI ---")
    usage_found = False
    metric_candidates = [
        REPO_ROOT / ".system_generated",
        REPO_ROOT / "scratch",
    ]
    for m_dir in metric_candidates:
        if m_dir.is_dir():
            metric_files = list(m_dir.glob("**/*token*.json")) + list(m_dir.glob("**/*usage*.json"))
            if metric_files:
                usage_found = True
                print(f"Trovati {len(metric_files)} log di utilizzo in {m_dir.name}/")

    if not usage_found:
        print("Nessun log locale di consumo registrato in .system_generated/ o scratch/.")
        print("(I log di consumo vengono popolati durante l'esecuzione di pipeline batch o eval offline).")

    print("\n" + "=" * 78)
    return 0


def cmd_chaos(args: argparse.Namespace) -> int:
    """Esegue il Chaos Test di sincronizzazione multi-nodo memoria (@linus & @carmack)."""
    script = REPO_ROOT / "scripts" / "chaos_sync_test.py"
    cmd = [sys.executable, str(script)]
    res = subprocess.run(cmd, cwd=str(REPO_ROOT))
    return res.returncode


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Antigravity Engineering Ecosystem — Unified CLI (v5.0.0)",
        prog="ecosystem",
    )
    subparsers = parser.add_subparsers(dest="subcommand", help="Comando da eseguire")

    # test
    p_test = subparsers.add_parser("test", help="Esegue tutti i test di regressione (Linter, Hooks, Doctest, Node)")
    p_test.add_argument("--keep-going", action="store_true", help="Non fermarsi al primo errore")

    # start
    p_start = subparsers.add_parser("start", help="Avvia il server Live Mission Control")
    p_start.add_argument("--lan", action="store_true", help="Abilita ascolto su 0.0.0.0 (Wi-Fi/LAN locale)")
    p_start.add_argument("--port", type=int, default=8787, help="Porta TCP (default: 8787)")
    p_start.add_argument("--studio", action="store_true", help="Avvia versione Studio anziche' Live standard")
    p_start.add_argument("--open", action="store_true", help="Apre automaticamente la dashboard nel browser predefinito")

    # status
    p_status = subparsers.add_parser("status", help="Stato dei runtime, git e probe del server")
    p_status.add_argument("--port", type=int, default=8787, help="Porta TCP per il probe (default: 8787)")

    # sync
    subparsers.add_parser("sync", help="Sincronizza l'ambiente con script nativo (macOS o Windows 11)")

    # memory
    p_mem = subparsers.add_parser("memory", help="Consolida la memoria Google Drive con scrubbing PII preventivo")
    p_mem.add_argument("--project", type=str, help="Filtra per progetto specifico")

    # doctor
    subparsers.add_parser("doctor", help="Diagnostica approfondita dell'ambiente, dipendenze, permessi e integrità")

    # tokens
    p_tokens = subparsers.add_parser("tokens", help="Report sintetico di Model Tiering, Thinking Budget e stima Context Caching")
    p_tokens.add_argument("--include-agents", action="store_true", help="Includi anche i file profilo agents/ nel conteggio token")

    # eval
    subparsers.add_parser("eval", help="Esegue la suite di Offline Evals deterministica a costo zero token (@carmack & @andrej)")

    # cache
    p_cache = subparsers.add_parser("cache", help="Governa il bundle di Context Caching per Google Gemini (@andrej)")
    p_cache.add_argument("action", choices=["status", "build", "export-api"], nargs="?", default="status", help="Azione (status, build, export-api)")

    # chaos
    subparsers.add_parser("chaos", help="Esegue il Chaos Test di sincronizzazione multi-nodo memoria (@linus & @carmack)")

    args = parser.parse_args()
    if not args.subcommand:
        parser.print_help()
        return 0

    dispatcher = {
        "test": cmd_test,
        "start": cmd_start,
        "status": cmd_status,
        "sync": cmd_sync,
        "memory": cmd_memory,
        "doctor": cmd_doctor,
        "tokens": cmd_tokens,
        "eval": cmd_eval,
        "cache": cmd_cache,
        "chaos": cmd_chaos,
    }
    return dispatcher[args.subcommand](args)


if __name__ == "__main__":
    sys.exit(main())

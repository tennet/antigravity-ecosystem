#!/usr/bin/env python3
"""
scripts/ecosystem.py — Antigravity Engineering Ecosystem Unified CLI (v4.1.0)
Governa l'intero ecosistema con una singola interfaccia deterministica e cross-platform:
  - test: Esegue in sequenza linter, hook test, doctest e server node:test
  - start: Avvia Mission Control (Live o Studio) con bind fail-closed (127.0.0.1 o --lan)
  - status: Diagnostica ambiente, porte, runtime e stato git
  - sync: Sincronizzazione cross-platform (macOS / Windows 11)
  - memory: Consolidamento e scrubbing PII della memoria con Google Drive
"""

from __future__ import annotations

import argparse
import os
import platform
import subprocess
import sys
import urllib.request
import urllib.error
import json
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent


def print_banner() -> None:
    print("=" * 68)
    print(" 🚀 Antigravity Engineering Ecosystem — Unified CLI (v4.1.0)")
    print("    Alan Turing (@turing) & Engineering Team Canonical Suite")
    print("=" * 68)


def cmd_test(args: argparse.Namespace) -> int:
    """Esegue tutti i test di regressione in sequenza unificata."""
    print("[TEST GATE @carmack & @rauch] Avvio suite completa di test...\n")
    steps: list[tuple[str, list[str]]] = [
        ("Security Linter (@geohot)", [sys.executable, str(REPO_ROOT / "scripts" / "hooks" / "security_linter.py")]),
        ("Python Hooks & PII Scrubbing (@dpo)", [sys.executable, "-m", "unittest", str(REPO_ROOT / "scripts" / "hooks" / "test_hooks.py")]),
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
        req = urllib.request.Request(url, headers={"User-Agent": "EcosystemCLI/4.1.0"})
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


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Antigravity Engineering Ecosystem — Unified CLI (v4.1.0)",
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

    # status
    p_status = subparsers.add_parser("status", help="Stato dei runtime, git e probe del server")
    p_status.add_argument("--port", type=int, default=8787, help="Porta TCP per il probe (default: 8787)")

    # sync
    subparsers.add_parser("sync", help="Sincronizza l'ambiente con script nativo (macOS o Windows 11)")

    # memory
    p_mem = subparsers.add_parser("memory", help="Consolida la memoria Google Drive con scrubbing PII preventivo")
    p_mem.add_argument("--project", type=str, help="Filtra per progetto specifico")

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
    }
    return dispatcher[args.subcommand](args)


if __name__ == "__main__":
    sys.exit(main())

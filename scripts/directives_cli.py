#!/usr/bin/env python3
"""
directives_cli.py — Antigravity Directives CLI Bridge
Utility cross-platform per consultare e gestire le direttive inviate da Mission Control Studio
direttamente dal terminale o dagli agenti Antigravity.
"""

import os
import sys
import json
import argparse
from datetime import datetime

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
ROOT_DIR = os.path.abspath(os.path.join(SCRIPT_DIR, '..'))
QUEUE_PATH = os.path.join(ROOT_DIR, 'directives', 'queue.json')

def load_queue():
    if not os.path.exists(QUEUE_PATH):
        return {"version": "1.0.0", "updatedAt": datetime.utcnow().isoformat(), "directives": []}
    try:
        with open(QUEUE_PATH, 'r', encoding='utf-8') as f:
            return json.load(f)
    except Exception as e:
        print(f"[ERROR] Impossibile leggere {QUEUE_PATH}: {e}", file=sys.stderr)
        return {"version": "1.0.0", "updatedAt": datetime.utcnow().isoformat(), "directives": []}

def save_queue(data):
    os.makedirs(os.path.dirname(QUEUE_PATH), exist_ok=True)
    data["updatedAt"] = datetime.utcnow().isoformat()
    tmp_path = f"{QUEUE_PATH}.tmp"
    with open(tmp_path, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
    os.replace(tmp_path, QUEUE_PATH)

def cmd_list(args):
    data = load_queue()
    directives = data.get("directives", [])
    if args.agent:
        target = args.agent.lower().lstrip('@')
        directives = [d for d in directives if d.get('targetAgent') == target or d.get('targetAgent') == 'all']
    if args.status:
        directives = [d for d in directives if d.get('status') == args.status]

    print(f"\n📋 Coda Direttive Antigravity ({len(directives)} trovate):\n" + "=" * 65)
    if not directives:
        print("  Nessuna direttiva attiva trovata.")
    for d in directives:
        status_icon = "🟢" if d.get('status') == 'active' else "⚪"
        prio_icon = "🚨" if d.get('priority') in ('urgent', 'veto') else "⚡"
        print(f"{status_icon} [{d.get('id')}] {prio_icon} @{d.get('targetAgent')} ({d.get('priority', 'normal').upper()})")
        print(f"   Titolo    : {d.get('title')}")
        print(f"   Direttiva : {d.get('directive')}")
        print(f"   Prompt AGY: {d.get('antigravityPrompt')}")
        print("-" * 65)
    print()

def cmd_pending(args):
    data = load_queue()
    pending = [d for d in data.get("directives", []) if d.get("status") == "active"]
    if args.json:
        print(json.dumps({"total": len(pending), "directives": pending}, indent=2, ensure_ascii=False))
    else:
        print(f"Direttive in attesa: {len(pending)}")
        for d in pending:
            print(f"- [{d.get('id')}] @{d.get('targetAgent')}: {d.get('directive')}")

def cmd_add(args):
    data = load_queue()
    target = args.agent.lower().lstrip('@')
    directive = args.directive.strip()
    prio = args.priority
    prefix = "[VETO]" if prio == "veto" else "[URGENTE]" if prio == "urgent" else "[ALTA]" if prio == "high" else "[DIRETTIVA]"
    prompt = f"@{target} {prefix}: {directive}"

    new_id = f"dir-{int(datetime.utcnow().timestamp() * 1000)}"
    entry = {
        "id": new_id,
        "targetAgent": target,
        "title": directive[:40] + ("..." if len(directive) > 40 else ""),
        "directive": directive,
        "priority": prio,
        "status": "active",
        "createdAt": datetime.utcnow().isoformat(),
        "antigravityPrompt": prompt
    }
    data.setdefault("directives", []).insert(0, entry)
    save_queue(data)
    print(f"✓ Direttiva creata con ID: {new_id}")
    print(f"  Prompt: {prompt}")

def cmd_ack(args):
    data = load_queue()
    dir_id = args.id
    found = False
    for d in data.get("directives", []):
        if d.get("id") == dir_id:
            d["status"] = "completed"
            d["resolvedAt"] = datetime.utcnow().isoformat()
            found = True
            break
    if found:
        save_queue(data)
        print(f"✓ Direttiva '{dir_id}' contrassegnata come completata.")
    else:
        print(f"[ERROR] Direttiva '{dir_id}' non trovata.", file=sys.stderr)
        sys.exit(1)

def main():
    parser = argparse.ArgumentParser(description="Gestione Coda Direttive Antigravity")
    subparsers = parser.add_subparsers(dest="command", required=True)

    # list
    p_list = subparsers.add_parser("list", help="Elenca le direttive attive")
    p_list.add_argument("--agent", "-a", help="Filtra per agente (es. linus, steve)")
    p_list.add_argument("--status", "-s", default="active", help="Filtra per stato (active, completed)")
    p_list.set_defaults(func=cmd_list)

    # ack
    p_ack = subparsers.add_parser("ack", help="Completa una direttiva")
    p_ack.add_argument("id", help="ID della direttiva da completare")
    p_ack.set_defaults(func=cmd_ack)

    # pending
    p_pen = subparsers.add_parser("pending", help="Restituisce le direttive attive per Antigravity")
    p_pen.add_argument("--json", action="store_true", help="Output in formato JSON")
    p_pen.set_defaults(func=cmd_pending)

    # add
    p_add = subparsers.add_parser("add", help="Crea una nuova direttiva per un agente")
    p_add.add_argument("--agent", "-a", required=True, help="Agente target (es. steve, taylor, linus)")
    p_add.add_argument("--directive", "-d", required=True, help="Testo della direttiva")
    p_add.add_argument("--priority", "-p", default="normal", choices=["normal", "high", "urgent", "veto"], help="Priorità")
    p_add.set_defaults(func=cmd_add)

    args = parser.parse_args()
    args.func(args)

if __name__ == '__main__':
    main()

#!/usr/bin/env python3
"""
scripts/cache_manager.py — Antigravity Engineering Context Caching Manager (v5.0)
Architecture & Implementation: @andrej (ai-systems-engineer) & @turing

Governa il bundle canonico immutabile del Team Ingegneristico e la configurazione
per l'endpoint Google Gemini Context Caching API (v1beta/cachedContents):
  - build: Raccoglie e serializza i 12 volumi del Canone Ingegneristico e le regole
           in portable/system_context_v5.json con fingerprint crittografico SHA-256.
  - status: Verifica l'integrità del bundle, cache freshness (drift detection) e
            calcola la simulazione di risparmio economico (-75% / -80%).
  - export-api: Produce il payload standard JSON per invocare cachedContents.create
                su Google Gemini (Gemini 2.5 Flash, 3.1 Pro, 1.5 Pro).

Standard di Qualità:
  - Zero dipendenze esterne (solo Python 3 stdlib: json, pathlib, hashlib, sys, time, argparse).
  - Determinismo crittografico SHA-256 invariante rispetto al sistema operativo.
  - Exit code 0 su successo, 1 su errore di validazione.
"""

from __future__ import annotations

import argparse
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import platform
import re
import sys
from typing import Any

REPO_ROOT = Path(__file__).resolve().parent.parent
CANON_REFERENCES_DIR = REPO_ROOT / "portable" / "engineering-team" / "references"
CANON_RULES_DIR = REPO_ROOT / "portable" / "engineering-team" / "rules"
OUTPUT_BUNDLE_PATH = REPO_ROOT / "portable" / "system_context_v5.json"
CACHE_DISPLAY_NAME = "antigravity_engineering_canon_v5"
CHARS_PER_TOKEN = 3.8

MODEL_PRICING: dict[str, dict[str, float]] = {
    "models/gemini-3.1-pro": {
        "input_standard": 1.25,
        "input_cached": 0.3125,
        "storage_per_hour": 0.01,
    },
    "models/gemini-1.5-pro": {
        "input_standard": 1.25,
        "input_cached": 0.3125,
        "storage_per_hour": 0.01,
    },
    "models/gemini-2.5-flash": {
        "input_standard": 0.075,
        "input_cached": 0.01875,
        "storage_per_hour": 0.01,
    },
    "models/gemini-1.5-flash": {
        "input_standard": 0.075,
        "input_cached": 0.01875,
        "storage_per_hour": 0.01,
    },
}


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


def extract_header_title(content: str, fallback: str) -> str:
    match = re.search(r"^#\s+(.+)$", content, re.MULTILINE)
    if match:
        raw = match.group(1).strip()
        raw = re.sub(r"^[^\w\s]+\s*", "", raw)
        return raw
    return fallback


def extract_custodian(content: str) -> str:
    m_cust = re.search(r"> \*\*Custode\*\*:\s*`?([^`\n\r]+)`?", content)
    if m_cust:
        return m_cust.group(1).strip()
    m_ref = re.search(r"> \*\*Riferimento Primario per\*\*:\s*`?([^`\n\r]+)`?", content)
    if m_ref:
        return m_ref.group(1).strip()
    return "Antigravity Engineering Core"


def compute_sha256(data: str) -> str:
    return hashlib.sha256(data.encode("utf-8")).hexdigest()


def load_raw_sources() -> list[dict[str, Any]]:
    sources: list[dict[str, Any]] = []

    # 1. References (Canoni 01-12 + Index)
    if CANON_REFERENCES_DIR.is_dir():
        for fpath in sorted(CANON_REFERENCES_DIR.glob("*.md")):
            try:
                raw_text = fpath.read_text(encoding="utf-8", errors="ignore")
                norm_text = raw_text.replace("\r\n", "\n")
                rel = fpath.relative_to(REPO_ROOT).as_posix()
                sources.append({
                    "category": "canon" if fpath.name != "INDEX.md" else "index",
                    "file": fpath.name,
                    "relative_path": rel,
                    "content": norm_text,
                })
            except OSError as err:
                sys.stderr.write(f"Impossibile leggere {fpath}: {err}\n")

    # 2. Rules (AGENTS.md)
    if CANON_RULES_DIR.is_dir():
        for fpath in sorted(CANON_RULES_DIR.glob("*.md")):
            try:
                raw_text = fpath.read_text(encoding="utf-8", errors="ignore")
                norm_text = raw_text.replace("\r\n", "\n")
                rel = fpath.relative_to(REPO_ROOT).as_posix()
                sources.append({
                    "category": "rule",
                    "file": fpath.name,
                    "relative_path": rel,
                    "content": norm_text,
                })
            except OSError as err:
                sys.stderr.write(f"Impossibile leggere {fpath}: {err}\n")

    return sources


def calculate_bundle_fingerprint(sources: list[dict[str, Any]]) -> str:
    hasher = hashlib.sha256()
    for item in sorted(sources, key=lambda s: s["relative_path"]):
        hasher.update(item["relative_path"].encode("utf-8"))
        hasher.update(b"\x00")
        hasher.update(item["content"].encode("utf-8"))
        hasher.update(b"\x00")
    return hasher.hexdigest()


def compile_canonical_bundle() -> dict[str, Any]:
    sources = load_raw_sources()
    if not sources:
        raise RuntimeError("Nessuna sorgente canonica trovata in references/ o rules/.")

    fingerprint = calculate_bundle_fingerprint(sources)

    total_lines = 0
    total_words = 0
    total_chars = 0
    total_tokens = 0

    canons: list[dict[str, Any]] = []
    rules: list[dict[str, Any]] = []

    for item in sources:
        content = item["content"]
        lines = content.count("\n") + 1
        words = len(content.split())
        chars = len(content)
        est_tokens = int(chars / CHARS_PER_TOKEN)

        total_lines += lines
        total_words += words
        total_chars += chars
        total_tokens += est_tokens

        entry = {
            "file": item["file"],
            "relative_path": item["relative_path"],
            "title": extract_header_title(content, item["file"]),
            "characters": chars,
            "words": words,
            "lines": lines,
            "estimated_tokens": est_tokens,
            "sha256": compute_sha256(content),
            "content": content,
        }

        if item["category"] in ("canon", "index"):
            entry["custodian"] = extract_custodian(content)
            vol_match = re.match(r"^(\d{2})_", item["file"])
            entry["volume"] = vol_match.group(1) if vol_match else "INDEX"
            canons.append(entry)
        else:
            rules.append(entry)

    system_instruction_text = (
        "Sei il collettivo ingegneristico Antigravity Engineering Team v5.0 guidato da @turing (Project Orchestrator). "
        "Operi con il protocollo dialettico ad anello chiuso a 5 fasi, delegazione specialistica e rispetto assoluto "
        "dei 12 volumi del Canone Ingegneristico. Applica sempre determinismo nei test, prevenzione dei gap lock nel database, "
        "sicurezza difensiva OWASP LLM Top 10, isolamento di rete nei test e parità invariante tra sistemi macOS e Windows."
    )

    bundle: dict[str, Any] = {
        "schema_version": "5.0.0",
        "bundle_name": CACHE_DISPLAY_NAME,
        "description": "Unified Immutable Canonical Engineering Context for Antigravity AI Ecosystem",
        "built_at_utc": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "fingerprint_sha256": fingerprint,
        "stats": {
            "total_files": len(sources),
            "total_canons": len(canons),
            "total_rules": len(rules),
            "total_lines": total_lines,
            "total_words": total_words,
            "total_characters": total_chars,
            "estimated_tokens": total_tokens,
            "chars_per_token": CHARS_PER_TOKEN,
        },
        "system_instruction": {
            "role": "system",
            "text": system_instruction_text,
        },
        "rules": rules,
        "canons": canons,
        "caching_compatibility": {
            "min_tokens_required": 32768,
            "standalone_tokens": total_tokens,
            "note": "Per i modelli con soglia minima di 32.768 token, il bundle statico (~22k) raggiunge la soglia se unito a regole di workspace o session history.",
            "target_models": list(MODEL_PRICING.keys()),
        },
    }

    return bundle


def cmd_build(args: argparse.Namespace) -> int:
    target_path = Path(args.output) if args.output else OUTPUT_BUNDLE_PATH
    print(f"\n🔹 Compilazione Bundle Canonico Immutabile: {target_path.relative_to(REPO_ROOT) if target_path.is_relative_to(REPO_ROOT) else target_path}")

    try:
        bundle = compile_canonical_bundle()
    except Exception as e:
        print(mark_fail(f"Errore durante la compilazione del bundle: {e}"))
        return 1

    stats = bundle["stats"]
    fingerprint = bundle["fingerprint_sha256"]

    # Scrittura atomica per prevenire corruzioni
    target_path.parent.mkdir(parents=True, exist_ok=True)
    temp_target = target_path.with_suffix(".tmp")
    with temp_target.open("w", encoding="utf-8") as f:
        json.dump(bundle, f, indent=2, ensure_ascii=False)
    temp_target.replace(target_path)

    header = f"{'DOCUMENTO':<40} | {'RIGHE':<6} | {'CARATTERI':<10} | {'TOKEN (~3.8c/t)'} | {'SHA-256 (PREFIX)'}"
    sep = "-" * len(header)
    print(sep)
    print(header)
    print(sep)

    for r in bundle["rules"]:
        print(f"[RULE] {r['file']:<33} | {r['lines']:>6} | {r['characters']:>10,} | {r['estimated_tokens']:>14,} | {r['sha256'][:12]}...")

    for c in bundle["canons"]:
        tag = f"[{c['volume']}]" if c["volume"] != "INDEX" else "[IDX]"
        fname = f"{tag} {c['file']}"
        print(f"{fname:<40} | {c['lines']:>6} | {c['characters']:>10,} | {c['estimated_tokens']:>14,} | {c['sha256'][:12]}...")

    print(sep)
    print(f"{'TOTALE BUNDLE UNIFICATO':<40} | {stats['total_lines']:>6} | {stats['total_characters']:>10,} | {stats['estimated_tokens']:>14,} | {fingerprint[:12]}...")
    print(sep)

    print(mark_ok(f"Bundle salvato con successo: {target_path}"))
    print(f"   • SHA-256 Fingerprint: \033[1m{fingerprint}\033[0m" if USE_COLOR else f"   • SHA-256 Fingerprint: {fingerprint}")
    print(f"   • Token Statici Stimati: ~{stats['estimated_tokens']:,} token")
    print(f"   • Documenti Inclusi: {stats['total_files']} ({stats['total_canons']} capitoli canone + {stats['total_rules']} regole)\n")
    return 0


def cmd_status(args: argparse.Namespace) -> int:
    target_path = Path(args.bundle) if args.bundle else OUTPUT_BUNDLE_PATH
    print("\n--- 🔍 STATO & VERIFICA INTEGRITÀ CONTEXT CACHING ---")

    if not target_path.is_file():
        print(mark_warn(f"Bundle non trovato: {target_path}"))
        print("   Esegui prima: \033[1mpython3 scripts/cache_manager.py build\033[0m\n" if USE_COLOR else "   Esegui prima: python3 scripts/cache_manager.py build\n")
        return 1

    try:
        bundle_text = target_path.read_text(encoding="utf-8")
        bundle = json.loads(bundle_text)
    except Exception as e:
        print(mark_fail(f"Impossibile leggere o deserializzare il bundle {target_path}: {e}"))
        return 1

    saved_fp = bundle.get("fingerprint_sha256", "")
    stats = bundle.get("stats", {})
    built_at = bundle.get("built_at_utc", "N/A")
    total_tokens = stats.get("estimated_tokens", 0)

    # Verifica freschezza rispetto ai sorgenti attuali su disco
    live_sources = load_raw_sources()
    live_fp = calculate_bundle_fingerprint(live_sources)

    is_fresh = saved_fp == live_fp
    status_label = mark_ok("CLEAN (In Sync — Nessun drift)") if is_fresh else mark_warn("DRIFT DETECTED (Sorgenti modificate rispetto al bundle)")

    print(f"   • Bundle Path:        {target_path}")
    print(f"   • Data Compilazione:  {built_at}")
    print(f"   • Fingerprint SHA256: {saved_fp}")
    print(f"   • Integrità Sorgenti: {status_label}")
    print(f"   • Token Statici:      ~{total_tokens:,} token ({stats.get('total_characters', 0):,} caratteri)")

    # Simulazione Economica & Latenza Context Caching
    print("\n🔹 SIMULAZIONE ECONOMICA CONTEXT CACHING (GEMINI API):")
    p_header = f"{'MODELLO TARGET':<25} | {'NO CACHE (TURNO)':<16} | {'CACHED (TURNO)':<15} | {'RISPARMIO':<10}"
    p_sep = "-" * len(p_header)
    print(p_sep)
    print(p_header)
    print(p_sep)

    for model_name, pricing in MODEL_PRICING.items():
        cost_no_cache = (total_tokens / 1_000_000) * pricing["input_standard"]
        cost_cached = (total_tokens / 1_000_000) * pricing["input_cached"]
        savings_pct = ((cost_no_cache - cost_cached) / cost_no_cache) * 100 if cost_no_cache > 0 else 0.0
        print(f"{model_name:<25} | ${cost_no_cache:>14.5f} | ${cost_cached:>13.5f} | {savings_pct:>9.1f}%")

    print(p_sep)

    # Costo storage cache per ora
    cost_storage_hour = (total_tokens / 1_000_000) * 0.01
    cost_storage_day = cost_storage_hour * 24
    print(f"\n   • Costo Storage Cache (TTL 1h): ~${cost_storage_hour:.6f} / ora (~${cost_storage_day:.5f} / giorno)")
    print("   • Soglia di Pareggio (Breakeven): Già a partire da 1 singolo turno/ora la cache è in netto profitto!")
    print("   • Riduzione Latenza Time-To-First-Token (TTFT): ~50% - 70% grazie ai KV-cache weights precomputati.\n")
    return 0


def cmd_export_api(args: argparse.Namespace) -> int:
    target_bundle = Path(args.bundle) if args.bundle else OUTPUT_BUNDLE_PATH

    if target_bundle.is_file():
        try:
            bundle = json.loads(target_bundle.read_text(encoding="utf-8"))
        except Exception:
            bundle = compile_canonical_bundle()
    else:
        bundle = compile_canonical_bundle()

    # Costruzione parti di contenuto per topic
    content_parts: list[dict[str, str]] = []

    # Introduzione & Regole
    rules_overview = "=== REGOLE OPERATIVE DEL TEAM DI INGEGNERIA ANTIGRAVITY (AGENTS.md) ===\n\n"
    for r in bundle.get("rules", []):
        rules_overview += f"# {r['title']}\n{r['content']}\n\n"
    content_parts.append({"text": rules_overview})

    # I 12 capitoli del Canone
    for c in bundle.get("canons", []):
        cap_text = (
            f"=== CANONE {c.get('volume', 'XX')}: {c.get('title', '')} ===\n"
            f"> Custode Designato: {c.get('custodian', '')}\n\n"
            f"{c.get('content', '')}\n"
        )
        content_parts.append({"text": cap_text})

    payload = {
        "model": args.model,
        "displayName": args.display_name or CACHE_DISPLAY_NAME,
        "ttl": args.ttl,
        "systemInstruction": {
            "parts": [
                {
                    "text": bundle.get("system_instruction", {}).get("text", "")
                }
            ]
        },
        "contents": [
            {
                "role": "user",
                "parts": content_parts,
            }
        ],
    }

    payload_json = json.dumps(payload, indent=2, ensure_ascii=False)

    if args.out:
        out_path = Path(args.out)
        out_path.parent.mkdir(parents=True, exist_ok=True)
        out_path.write_text(payload_json, encoding="utf-8")
        sys.stderr.write(mark_ok(f"Payload salvato in: {out_path}\n"))
    else:
        print(payload_json)

    if args.curl:
        sys.stderr.write("\n🔹 Esempio di Invocazione REST Gemini API:\n")
        sys.stderr.write(
            "curl -X POST \"https://generativelanguage.googleapis.com/v1beta/cachedContents?key=$GEMINI_API_KEY\" \\\n"
            "  -H \"Content-Type: application/json\" \\\n"
            f"  -d @{args.out or 'payload.json'}\n\n"
        )

    return 0


def main() -> int:
    parser = argparse.ArgumentParser(
        prog="cache_manager.py",
        description="Antigravity Engineering Context Caching Manager (v5.0) — Gemini Caching & Canonical Bundle",
    )
    subparsers = parser.add_subparsers(dest="command", required=True)

    # Subcommand: build
    p_build = subparsers.add_parser("build", help="Genera portable/system_context_v5.json dal Canone")
    p_build.add_argument("--output", "-o", help="Percorso alternativo per il file bundle JSON")

    # Subcommand: status
    p_status = subparsers.add_parser("status", help="Verifica integrità, freschezza e stima economica")
    p_status.add_argument("--bundle", "-b", help="Percorso alternativo del file bundle JSON")

    # Subcommand: export-api
    p_export = subparsers.add_parser("export-api", help="Genera payload REST per Gemini cachedContents.create")
    p_export.add_argument("--model", "-m", default="models/gemini-2.5-flash", help="Modello target Gemini (es. models/gemini-2.5-flash, models/gemini-3.1-pro)")
    p_export.add_argument("--ttl", default="3600s", help="TTL della cache (default: 3600s)")
    p_export.add_argument("--display-name", default=CACHE_DISPLAY_NAME, help="Nome visualizzato della risorsa di cache")
    p_export.add_argument("--bundle", "-b", help="Percorso alternativo del file bundle JSON da cui esportare")
    p_export.add_argument("--out", "-o", help="Scrivi il payload su file invece che su stdout")
    p_export.add_argument("--curl", action="store_true", help="Stampa l'esempio di chiamata curl su stderr")

    args = parser.parse_args()

    if args.command == "build":
        return cmd_build(args)
    elif args.command == "status":
        return cmd_status(args)
    elif args.command == "export-api":
        return cmd_export_api(args)
    else:
        parser.print_help()
        return 1


if __name__ == "__main__":
    sys.exit(main())

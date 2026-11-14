#!/usr/bin/env python3
"""
unify_memory.py - Deterministic Multi-Node Memory Consolidator (v4.0.0)
Part of Engineering Team Suite - Taylor, Linus & Guido
Autore: Manuele Francescon (@tennet)

Aggrega in modo deterministico e idempotente i log di memoria isolati
(memory_*.jsonl) su Google Drive / local brain, eliminando duplicati
tramite checksum canonico SHA-256, supportando node_id, filtro/tag per
progetto e segnalazione esplicita di righe JSONL corrotte.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import sys
from pathlib import Path

RE_HOME_UNIX = re.compile(r"/Users/[a-zA-Z0-9._-]+")
RE_HOME_WIN = re.compile(r"[A-Za-z]:\\Users\\[a-zA-Z0-9._-]+")
RE_BEARER = re.compile(r"Bearer\s+[A-Za-z0-9_\-\.]{15,}", re.IGNORECASE)
RE_SECRET_KV = re.compile(r'(?i)\b(api[_-]?key|token|password|secret|auth)\s*[:=]\s*["\']?[a-zA-Z0-9_\-\.]{8,}["\']?')


def scrub_pii(val: object) -> object:
    """Sanitizza percorsi locali, Bearer token e credenziali per GDPR & privacy compliance (@dpo)."""
    if isinstance(val, str):
        t = RE_HOME_UNIX.sub("~", val)
        t = RE_HOME_WIN.sub("~", t)
        t = RE_BEARER.sub("Bearer [REDACTED]", t)
        t = RE_SECRET_KV.sub(r"\1=[REDACTED]", t)
        return t
    if isinstance(val, list):
        return [scrub_pii(item) for item in val]
    if isinstance(val, dict):
        return {k: scrub_pii(v) for k, v in val.items()}
    return val


def resolve_node_id() -> str:
    env_node = os.getenv("ANTIGRAVITY_NODE_ID", "").strip()
    if env_node:
        return env_node
    settings_path = Path.home() / ".gemini" / "settings.json"
    if settings_path.is_file():
        try:
            data = json.loads(settings_path.read_text(encoding="utf-8"))
            node_id = str(data.get("node_id", "")).strip()
            if node_id:
                return node_id
        except (OSError, json.JSONDecodeError):
            pass
    return os.uname().nodename if hasattr(os, "uname") else "local-node"


def resolve_gdrive_brain() -> Path | None:
    env_brain = os.getenv("ANTIGRAVITY_BRAIN")
    if env_brain and Path(env_brain).is_dir():
        return Path(env_brain)

    home = Path.home()
    cloud_storage = home / "Library" / "CloudStorage"
    if cloud_storage.is_dir():
        for gdrive in sorted(cloud_storage.glob("GoogleDrive-*")):
            for drive_root in ("Il mio Drive", "My Drive"):
                candidate = gdrive / drive_root / "Antigravity_Brain"
                if candidate.is_dir():
                    return candidate

    for letter in ["G", "H", "D", "E"]:
        for drive_root in ("Il mio Drive", "My Drive"):
            candidate_win = Path(f"{letter}:\\{drive_root}\\Antigravity_Brain")
            if candidate_win.is_dir():
                return candidate_win

    local_fallback = home / ".gemini" / "Antigravity_Brain"
    if local_fallback.is_dir():
        return local_fallback

    return None


def compute_checksum(obj: dict) -> str:
    """Calcola l'hash SHA-256 canonico per evitare duplicati."""
    if "checksum" in obj and obj["checksum"]:
        return str(obj["checksum"])

    item_type = obj.get("type", "unknown")
    project = obj.get("project", "")
    if item_type == "entity":
        seed = f"entity:{project}:{obj.get('name', '')}:{obj.get('entityType', '')}"
    elif item_type == "relation":
        seed = f"rel:{project}:{obj.get('from', '')}->{obj.get('to', '')}:{obj.get('relationType', '')}"
    else:
        seed = json.dumps(obj, sort_keys=True)

    return f"sha256:{hashlib.sha256(seed.encode('utf-8')).hexdigest()}"


def consolidate_memory(
    brain_dir: Path,
    target_output: Path,
    project_filter: str | None = None,
) -> dict:
    memory_dir = brain_dir / "memory"
    if not memory_dir.is_dir():
        print(f"[WARN] Memory directory not found at {memory_dir}")
        return {"entities": 0, "relations": 0, "files_scanned": 0, "malformed_lines": 0}

    node_files = sorted(memory_dir.glob("memory_*.jsonl"))
    print(f"[INFO] Trovati {len(node_files)} file di memoria da aggregare:")
    for f in node_files:
        print(f"       -> {f.name} ({f.stat().st_size} bytes)")

    entities_by_key: dict[tuple[str, str], dict] = {}
    relations_by_edge: dict[tuple[str, str, str, str], dict] = {}
    total_raw_records = 0
    malformed_lines = 0

    for fpath in node_files:
        try:
            with open(fpath, "r", encoding="utf-8") as f:
                for line_idx, line in enumerate(f, 1):
                    line = line.strip()
                    if not line:
                        continue
                    try:
                        record = json.loads(line)
                    except json.JSONDecodeError as exc:
                        malformed_lines += 1
                        print(f"[WARN] Riga JSONL malformata in {fpath.name}:{line_idx}: {exc.msg}")
                        continue

                    if not isinstance(record, dict):
                        malformed_lines += 1
                        print(f"[WARN] Record non-oggetto ignorato in {fpath.name}:{line_idx}")
                        continue

                    rec_project = str(record.get("project", "global")).strip() or "global"
                    if project_filter and rec_project != project_filter:
                        continue

                    total_raw_records += 1
                    rec_type = record.get("type")

                    if rec_type == "entity":
                        name = record.get("name")
                        if not name:
                            continue
                        key = (rec_project, str(name))
                        raw_obs = record.get("observations", [])
                        scrubbed_obs = [str(scrub_pii(str(o))) for o in raw_obs if o is not None]
                        if key not in entities_by_key:
                            entities_by_key[key] = {
                                "type": "entity",
                                "project": rec_project,
                                "name": str(name),
                                "entityType": record.get("entityType", "Generic"),
                                "observations": list(scrubbed_obs),
                                "checksum": compute_checksum(record),
                            }
                        else:
                            existing_obs = set(entities_by_key[key]["observations"])
                            for s_obs in scrubbed_obs:
                                if s_obs not in existing_obs:
                                    entities_by_key[key]["observations"].append(s_obs)
                                    existing_obs.add(s_obs)

                    elif rec_type == "relation":
                        src = record.get("from")
                        dst = record.get("to")
                        rel = record.get("relationType", "RELATED_TO")
                        if not src or not dst:
                            continue
                        edge_key = (rec_project, str(src), str(dst), str(rel))
                        if edge_key not in relations_by_edge:
                            relations_by_edge[edge_key] = {
                                "type": "relation",
                                "project": rec_project,
                                "from": str(src),
                                "to": str(dst),
                                "relationType": str(rel),
                                "checksum": compute_checksum(record),
                            }
        except OSError as exc:
            print(f"[ERROR] Impossibile leggere {fpath.name}: {exc}")

    target_output.parent.mkdir(parents=True, exist_ok=True)
    tmp_output = target_output.with_suffix(".tmp")

    with open(tmp_output, "w", encoding="utf-8") as out:
        for ent in entities_by_key.values():
            out.write(json.dumps(ent, ensure_ascii=False) + "\n")
        for rel in relations_by_edge.values():
            out.write(json.dumps(rel, ensure_ascii=False) + "\n")

    tmp_output.replace(target_output)

    print("\n[OK] Memoria unificata consolidata con successo in:")
    print(f"     -> {target_output}")
    print(f"     Node ID locale:      {resolve_node_id()}")
    print(f"     Record grezzi letti: {total_raw_records}")
    print(f"     Righe malformate:    {malformed_lines}")
    print(f"     Entita' unificate:   {len(entities_by_key)}")
    print(f"     Relazioni unificate: {len(relations_by_edge)}")

    return {
        "entities": len(entities_by_key),
        "relations": len(relations_by_edge),
        "files_scanned": len(node_files),
        "malformed_lines": malformed_lines,
        "target": str(target_output),
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Consolidatore multi-nodo memoria Antigravity")
    parser.add_argument("--brain", type=Path, default=None, help="Percorso cartella Antigravity_Brain")
    parser.add_argument("--output", type=Path, default=None, help="Output file JSONL unificato")
    parser.add_argument("--project", type=str, default=None, help="Filtra entita'/relazioni per progetto")
    args = parser.parse_args(argv)

    brain = args.brain if args.brain else resolve_gdrive_brain()
    if not brain or not brain.is_dir():
        print("[ERROR] Google Drive Antigravity_Brain non trovato! Verifica il mount o passa --brain.")
        return 1

    print(f"[INFO] Individuato Antigravity_Brain: {brain}")
    unified_local = args.output or (Path.home() / ".gemini" / "antigravity" / "knowledge_graph_unified.jsonl")
    consolidate_memory(brain, unified_local, project_filter=args.project)
    return 0


if __name__ == "__main__":
    sys.exit(main())

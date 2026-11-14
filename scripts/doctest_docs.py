#!/usr/bin/env python3
"""
doctest_docs.py - Testable Documentation & Parity Gate (Canone 08 / v4.0.0)
Verifica automaticamente:
1. Integrità dei link Markdown locali (escludendo URL esterni e ancore pure).
2. Sintassi dei blocchi di codice fenced (bash/sh via bash -n, json via json.loads, python via ast.parse).
3. Parità di versione tra plugin.json e README.md / VADEMECUM.md / references/INDEX.md.
"""

from __future__ import annotations

import argparse
import ast
import json
import os
import re
import subprocess
import sys
from pathlib import Path

SKIP_DIRS = {".git", "node_modules", "vendor", "__pycache__", ".venv", "dist"}
LINK_RE = re.compile(r"!?\[[^\]]*\]\(([^)]+)\)")
FENCE_RE = re.compile(r"```([a-zA-Z0-9_-]*)\n(.*?)```", re.DOTALL)


def check_markdown_links(md_path: Path, root: Path) -> list[str]:
    errors: list[str] = []
    text = md_path.read_text(encoding="utf-8", errors="ignore")
    # Remove fenced code blocks before checking links to avoid false positives in examples
    cleaned = FENCE_RE.sub("", text)

    for raw_target in LINK_RE.findall(cleaned):
        target = raw_target.strip().split()[0]
        if not target or target.startswith(("#", "http://", "https://", "mailto:", "file://")):
            continue
        path_only = target.split("#", 1)[0]
        if not path_only:
            continue
        candidate = (md_path.parent / path_only).resolve()
        if not candidate.exists():
            rel_md = md_path.relative_to(root)
            errors.append(f"[LINK] Target mancante in {rel_md}: '{target}'")
    return errors


def check_fenced_blocks(md_path: Path, root: Path) -> list[str]:
    errors: list[str] = []
    text = md_path.read_text(encoding="utf-8", errors="ignore")
    rel_md = md_path.relative_to(root)

    for idx, match in enumerate(FENCE_RE.finditer(text), 1):
        lang = match.group(1).strip().lower()
        code = match.group(2)
        if not code.strip():
            continue

        if lang in {"json"}:
            try:
                json.loads(code)
            except json.JSONDecodeError as exc:
                errors.append(f"[SYNTAX:json] {rel_md} blocco #{idx}: {exc.msg}")
        elif lang in {"python", "py"}:
            try:
                ast.parse(code)
            except SyntaxError as exc:
                errors.append(f"[SYNTAX:python] {rel_md} blocco #{idx}: {exc.msg}")
        elif lang in {"bash", "sh"}:
            # Skip illustrative pseudo-commands containing placeholder brackets like [tua idea]
            if "[" in code and "]" in code and "if [" not in code and "[ -" not in code and "[ !" not in code:
                continue
            res = subprocess.run(
                ["bash", "-n", "-s"],
                input=code,
                text=True,
                capture_output=True,
                timeout=5,
                check=False,
            )
            if res.returncode != 0:
                err_msg = res.stderr.strip().splitlines()[0] if res.stderr else "syntax error"
                errors.append(f"[SYNTAX:bash] {rel_md} blocco #{idx}: {err_msg}")
    return errors


def check_plugin_version_parity(root: Path) -> list[str]:
    errors: list[str] = []
    plugin_dir = root / "portable" / "engineering-team"
    manifest = plugin_dir / "plugin.json"
    if not manifest.is_file():
        return errors

    data = json.loads(manifest.read_text(encoding="utf-8"))
    version = str(data.get("version", "")).strip()
    if not version:
        return ["[PARITY] Campo 'version' mancante in portable/engineering-team/plugin.json"]

    for doc_name in ["README.md", "VADEMECUM.md", "references/INDEX.md"]:
        doc_path = plugin_dir / doc_name
        if not doc_path.is_file():
            errors.append(f"[PARITY] Documento mancante: {doc_path.relative_to(root)}")
            continue
        content = doc_path.read_text(encoding="utf-8", errors="ignore")
        if version not in content:
            errors.append(
                f"[PARITY] Versione '{version}' da plugin.json non trovata in {doc_path.relative_to(root)}"
            )
    return errors


def run_doctest(root: Path) -> int:
    targets = [
        root / "README.md",
        root / "portable" / "engineering-team",
        root / "skills",
    ]
    md_files: list[Path] = []
    for t in targets:
        if t.is_file():
            md_files.append(t)
        elif t.is_dir():
            for dirpath, dirnames, filenames in os.walk(t):
                dirnames[:] = [d for d in dirnames if d not in SKIP_DIRS]
                for fname in filenames:
                    if fname.endswith(".md"):
                        md_files.append(Path(dirpath) / fname)

    md_files = sorted(set(md_files))
    errors: list[str] = []
    for md in md_files:
        errors.extend(check_markdown_links(md, root))
        errors.extend(check_fenced_blocks(md, root))
    errors.extend(check_plugin_version_parity(root))

    print(f"[DOCTEST] File Markdown verificati: {len(md_files)}")
    if errors:
        for err in errors:
            print(f"[DOCTEST] {err}")
        print(f"[DOCTEST] FALLITO con {len(errors)} errori.")
        return 1

    print("[DOCTEST] OK: tutti i link, gli snippet sintattici e le versioni sono coerenti.")
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Doctest & Doc Integrity Runner")
    parser.add_argument(
        "--root",
        type=Path,
        default=Path(__file__).resolve().parents[1],
        help="Root del repository da verificare",
    )
    args = parser.parse_args(argv)
    return run_doctest(args.root.resolve())


if __name__ == "__main__":
    sys.exit(main())

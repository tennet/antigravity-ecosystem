#!/usr/bin/env python3
"""
Pre-commit / Pre-push & Workspace Security Linter
Engineering Team v4.0.0 (Linus & Geohot)
Esegue verifiche reali su segreti hardcoded, file .env esposti, fallback password nei compose e chiavi private.
"""

from __future__ import annotations

import argparse
import os
import re
import subprocess
import sys
from pathlib import Path

SKIP_DIRS = {".git", "node_modules", "vendor", "__pycache__", ".venv", "dist"}
TEXT_EXTENSIONS = {
    ".php", ".py", ".js", ".mjs", ".ts", ".sh", ".ps1",
    ".yml", ".yaml", ".json", ".env", ".example", ".md", ".blade.php", ".conf",
}

SECRET_PATTERNS: list[tuple[str, re.Pattern[str]]] = [
    ("AWS Access Key", re.compile(r"\bAKIA[0-9A-Z]{16}\b")),
    ("Private Key Block", re.compile(r"-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----")),
    ("OpenAI / Anthropic Key", re.compile(r"\bsk-(?:proj-|ant-)?[A-Za-z0-9_-]{24,}\b")),
    ("GitHub Token", re.compile(r"\b(?:ghp|gho|ghu|ghs)_[A-Za-z0-9]{30,}\b")),
    ("Google API Key", re.compile(r"\bAIza[0-9A-Za-z_-]{35}\b")),
]

COMPOSE_FALLBACK_RE = re.compile(
    r"\$\{[A-Z0-9_]*(?:PASSWORD|SECRET|TOKEN|API_KEY)[A-Z0-9_]*:-[^}]+\}"
)


def is_text_candidate(path: Path) -> bool:
    name = path.name
    if name in {".env", ".env.example", "Dockerfile", "Caddyfile", "Caddyfile.example"}:
        return True
    return path.suffix in TEXT_EXTENSIONS or name.endswith(".blade.php")


def iter_candidate_files(root: Path) -> list[Path]:
    files: list[Path] = []
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = [d for d in dirnames if d not in SKIP_DIRS]
        for fname in filenames:
            fpath = Path(dirpath) / fname
            if is_text_candidate(fpath) or fpath.suffix in {".pem", ".key"}:
                files.append(fpath)
    return sorted(files)


def check_tracked_env(root: Path) -> list[str]:
    findings: list[str] = []
    if not (root / ".git").exists():
        return findings
    try:
        res = subprocess.run(
            ["git", "-C", str(root), "ls-files", "--", ".env", "**/.env", "*.pem", "*.key"],
            capture_output=True,
            text=True,
            timeout=5,
            check=False,
        )
        if res.returncode == 0:
            for line in res.stdout.splitlines():
                rel = line.strip()
                if rel and not rel.endswith(".example"):
                    findings.append(f"[CRITICAL] File sensibile tracciato in Git: {rel}")
    except (OSError, subprocess.SubprocessError):
        pass
    return findings


def scan_file(fpath: Path, root: Path) -> list[str]:
    findings: list[str] = []
    try:
        rel = fpath.relative_to(root)
    except ValueError:
        rel = fpath

    if fpath.suffix in {".pem", ".key"}:
        findings.append(f"[HIGH] Chiave privata trovata nel workspace: {rel}")
        return findings

    if fpath.name == "security_linter.py":
        return findings

    try:
        content = fpath.read_text(encoding="utf-8", errors="ignore")
    except OSError as exc:
        findings.append(f"[WARN] Impossibile leggere {rel}: {exc}")
        return findings

    for label, pattern in SECRET_PATTERNS:
        if pattern.search(content):
            findings.append(f"[CRITICAL] Possibile segreto ({label}) in: {rel}")

    if fpath.suffix in {".yml", ".yaml"}:
        for idx, line in enumerate(content.splitlines(), 1):
            if COMPOSE_FALLBACK_RE.search(line):
                findings.append(
                    f"[HIGH] Password/Secret fallback hardcoded in YAML ({rel}:{idx}); usa ${{VAR:?Error}}"
                )

    return findings


def run_checks(root: Path) -> int:
    print("[HOOK] Running Cross-Platform DevOps & Security Linter (v4.0.0)...")
    print(f"[HOOK] Root: {root} | Python: {sys.executable.split('/')[-1]} | Platform: {sys.platform}")

    findings: list[str] = []
    findings.extend(check_tracked_env(root))

    for fpath in iter_candidate_files(root):
        findings.extend(scan_file(fpath, root))

    critical_or_high = [f for f in findings if f.startswith("[CRITICAL]") or f.startswith("[HIGH]")]
    for item in findings:
        print(f"[HOOK] {item}")

    if critical_or_high:
        print(f"[HOOK] BLOCCATO: rilevati {len(critical_or_high)} rilievi High/Critical.")
        return 1

    print("[HOOK] All security assertions passed.")
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Security Linter per workspace Antigravity")
    parser.add_argument(
        "--root",
        type=Path,
        default=Path(__file__).resolve().parents[2],
        help="Directory radice da scansionare",
    )
    args = parser.parse_args(argv)
    return run_checks(args.root.resolve())


if __name__ == "__main__":
    sys.exit(main())

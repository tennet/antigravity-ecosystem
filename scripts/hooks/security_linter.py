#!/usr/bin/env python3
"""
Pre-commit / Pre-push & Workspace Security Linter
Engineering Team v4.1.0 / Master Blueprint v5.0 (Geohot & Linus)
Esegue verifiche reali e deterministiche su:
1. Segreti hardcoded (AWS, Private Keys, OpenAI/Anthropic, GitHub, Google API Keys).
2. File .env tracciati in Git.
3. Fallback password insicuri nei docker-compose YAML (${VAR:-default}).
4. Comandi distruttivi e flag injection non sanitizzati (rm -rf /, chmod 777, curl/wget | sh, fork bomb).
5. Endpoint HTTP in chiaro con credenziali o token embedded nei parametri.
6. Pattern noti di Prompt Injection (Ignore instructions, System prompt leak attempt).
7. Protezione da Path Traversal (relative path ../../ che escono dal repository).
"""

from __future__ import annotations

import argparse
import os
import re
import subprocess
import sys
from pathlib import Path

SKIP_DIRS = {".git", "node_modules", "vendor", "__pycache__", ".venv", "dist", "fixtures"}
SKIP_FILES = {
    "security_linter.py", "test_hooks.py", "eval_runner.py",
    "test_eval_runner.py", "cache_manager.py", "system_context_v5.json",
    "chaos_sync_test.py",
}

TEXT_EXTENSIONS = {
    ".php", ".py", ".js", ".mjs", ".ts", ".sh", ".ps1",
    ".yml", ".yaml", ".json", ".env", ".example", ".md", ".blade.php", ".conf",
}

CODE_EXTENSIONS = {
    ".php", ".py", ".js", ".mjs", ".ts", ".sh", ".bash", ".zsh", ".ps1", ".blade.php",
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

# 1. Comandi distruttivi e shell injection
DESTRUCTIVE_RM_RE = re.compile(
    r"\brm\s+(?:-[a-zA-Z0-9-]+\s+)*(?:/|/\*|~|~/\*|\$HOME|\$HOME/\*|/root|/etc|/boot)(?:\s|$|;|\||&|>)",
    re.IGNORECASE,
)
CHMOD_777_RE = re.compile(r"\bchmod\s+(?:-[a-zA-Z0-9]+\s+)*777\b")
SHELL_PIPE_RE = re.compile(
    r"\b(?:curl|wget)\s+[^;\n|&]*\|\s*(?:sudo\s+)?(?:ba|z|da)?sh\b",
    re.IGNORECASE,
)
FORK_BOMB_RE = re.compile(
    r"(?::\s*\(\s*\)\s*\{\s*:\s*\|\s*:\s*&\s*\}\s*;\s*:|(?P<name>[a-zA-Z0-9_]+)\s*\(\s*\)\s*\{\s*(?P=name)\s*\|\s*(?P=name)\s*&\s*\}\s*;\s*(?P=name))"
)

# 2. Endpoint HTTP in chiaro con credenziali o token nei parametri
HTTP_CLEARTEXT_CRED_RE = re.compile(
    r"http://[^\s'\"`<>]+?[?&](?:[a-zA-Z0-9_]*?(?:token|api[_-]?key|secret|password|auth|passwd|credentials))[a-zA-Z0-9_]*=[^\s'\"`&<>]{3,}",
    re.IGNORECASE,
)

# 3. Prompt injection noti
PROMPT_INJECTION_PATTERNS: list[tuple[str, re.Pattern[str]]] = [
    (
        "Ignore Previous Instructions",
        re.compile(
            r"(?i)\b(?:ignore|disregard|forget|override)\s+(?:all\s+)?(?:previous|prior|above|existing)\s+(?:instructions|prompts|rules|commands)\b"
        ),
    ),
    (
        "System Prompt Leak Attempt",
        re.compile(
            r"(?i)\b(?:system\s+prompt\s+leak(?:\s+attempt)?|repeat\s+(?:all\s+)?(?:the\s+)?system\s+prompt|reveal\s+(?:your\s+)?(?:system\s+prompt|initial\s+instructions|system\s+instructions))\b"
        ),
    ),
]


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


def check_path_traversal(content: str, fpath: Path, root: Path) -> list[str]:
    findings: list[str] = []
    traversal_re = re.compile(r"""(?:["'`]|\b)((?:\.\.(?:/|\\)){2,}[^\s"'`<>]+)""")
    try:
        rel = fpath.relative_to(root)
    except ValueError:
        rel = fpath

    for match in traversal_re.finditer(content):
        raw_target = match.group(1).replace("\\", "/").rstrip(";:,.)]")
        try:
            resolved = (fpath.parent / raw_target).resolve()
            try:
                resolved.relative_to(root)
            except ValueError:
                findings.append(
                    f"[CRITICAL] Path traversal che esce dalla root del repository ({raw_target}) in: {rel}"
                )
        except (ValueError, OSError):
            findings.append(
                f"[CRITICAL] Path traversal non valido ({raw_target}) in: {rel}"
            )
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

    if fpath.name in SKIP_FILES:
        return findings

    try:
        content = fpath.read_text(encoding="utf-8", errors="ignore")
    except OSError as exc:
        findings.append(f"[WARN] Impossibile leggere {rel}: {exc}")
        return findings

    is_md = fpath.suffix == ".md"
    is_canon_doc = is_md and any(p in fpath.parts for p in ("references", "docs", "plugin", "portable"))
    is_test_file = (
        fpath.name.endswith(".test.mjs")
        or fpath.name.endswith(".test.js")
        or fpath.name.startswith("test_")
        or fpath.name.endswith("_test.py")
    )

    # 1. Hardcoded Secret Patterns
    for label, pattern in SECRET_PATTERNS:
        if pattern.search(content):
            findings.append(f"[CRITICAL] Possibile segreto ({label}) in: {rel}")

    # 2. Docker Compose Fallback Password
    if fpath.suffix in {".yml", ".yaml"}:
        for idx, line in enumerate(content.splitlines(), 1):
            if COMPOSE_FALLBACK_RE.search(line):
                findings.append(
                    f"[HIGH] Password/Secret fallback hardcoded in YAML ({rel}:{idx}); usa ${{VAR:?Error}}"
                )

    # 3. Comandi Distruttivi e Shell Injection (solo file eseguibili/codice/Dockerfile)
    if not is_md:
        if DESTRUCTIVE_RM_RE.search(content):
            findings.append(f"[CRITICAL] Comando distruttivo rilevato (rm root/home) in: {rel}")
        if CHMOD_777_RE.search(content):
            findings.append(f"[HIGH] Permessi insicuri rilevati (chmod 777) in: {rel}")
        if SHELL_PIPE_RE.search(content):
            findings.append(f"[CRITICAL] Shell injection non sicura (curl/wget | sh) in: {rel}")
        if FORK_BOMB_RE.search(content):
            findings.append(f"[CRITICAL] Fork bomb DoS rilevata in: {rel}")

    # 4. Cleartext HTTP con credenziali o token nei parametri
    if not is_canon_doc:
        for match in HTTP_CLEARTEXT_CRED_RE.finditer(content):
            findings.append(
                f"[CRITICAL] Endpoint HTTP in chiaro con credenziali/token nei parametri ({match.group(0)[:60]}...) in: {rel}"
            )

    # 5. Prompt Injection Patterns (template, input, config e file sensibili)
    if not is_canon_doc:
        for label, pattern in PROMPT_INJECTION_PATTERNS:
            if pattern.search(content):
                findings.append(f"[HIGH] Possibile prompt injection rilevata ({label}) in: {rel}")

    # 6. Path Traversal che esce dal repository (esclusi file di test con payload di verifica)
    if not is_canon_doc and not is_test_file:
        findings.extend(check_path_traversal(content, fpath, root))

    return findings


def run_checks(root: Path) -> int:
    print("[HOOK] Running Cross-Platform DevOps & Security Linter (v4.1.0 - Geohot Hardened)...")
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

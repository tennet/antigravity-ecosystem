#!/usr/bin/env python3
"""
install_ecosystem_local.py - Installa localmente in ~/.gemini/config la suite v4.1.0 e le Skill Pack.
- Copia portable/engineering-team -> ~/.gemini/config/plugins/engineering-team (senza toccare .git)
- Copia scripts/hooks/{security_linter.py,unify_memory.py} -> plugin hooks
- Archivia in modo reversibile le 18 skill GCP/BigQuery/Spark in ~/.gemini/config/skills-packs/gcp-data-pack/
- Installa le 13 nuove skill da skills/ in ~/.gemini/config/skills/
"""

from __future__ import annotations

import argparse
import shutil
import sys
from pathlib import Path

GCP_SKILLS = [
    "bigquery-data-transfer-service",
    "bigquery-sql",
    "building-data-apps",
    "data-autocleaning",
    "dataform-bigquery",
    "dbt-bigquery",
    "discovering-gcp-data-assets",
    "enforcing-resource-attribution",
    "gcp-data-pipelines",
    "gcp-dataflow",
    "gcp-pipeline-orchestration",
    "gcp-pipeline-resource-provisioning",
    "gcp-spark",
    "gcp-spark-troubleshooting",
    "google-cloud-auth-verification",
    "ml-best-practices",
    "notebook-guidance",
    "schema-mapping",
]


def sync_tree(src: Path, dst: Path, dry_run: bool) -> None:
    if dry_run:
        print(f"[DRY-RUN] copy tree {src} -> {dst}")
        return
    shutil.copytree(src, dst, dirs_exist_ok=True)


def sync_file(src: Path, dst: Path, dry_run: bool) -> None:
    if dry_run:
        print(f"[DRY-RUN] copy file {src} -> {dst}")
        return
    dst.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(src, dst)


def install_all(repo_root: Path, gemini_config: Path, dry_run: bool) -> int:
    src_plugin = repo_root / "portable" / "engineering-team"
    dst_plugin = gemini_config / "plugins" / "engineering-team"
    src_skills = repo_root / "skills"
    dst_skills = gemini_config / "skills"
    gcp_pack_dir = gemini_config / "skills-packs" / "gcp-data-pack"

    if not (src_plugin / "plugin.json").is_file():
        print(f"[ERROR] Sorgente plugin non trovata in {src_plugin}")
        return 1

    print(f"[INSTALL] Plugin v4.1.0 -> {dst_plugin}")
    for sub in ("agents", "references", "rules"):
        if (src_plugin / sub).is_dir():
            sync_tree(src_plugin / sub, dst_plugin / sub, dry_run)
    for fname in ("plugin.json", "README.md", "VADEMECUM.md"):
        sync_file(src_plugin / fname, dst_plugin / fname, dry_run)

    for hook_name in ("security_linter.py", "unify_memory.py"):
        hook_src = repo_root / "scripts" / "hooks" / hook_name
        if hook_src.is_file():
            sync_file(hook_src, dst_plugin / "hooks" / hook_name, dry_run)

    if not dry_run:
        gcp_pack_dir.mkdir(parents=True, exist_ok=True)
        dst_skills.mkdir(parents=True, exist_ok=True)

    archived_count = 0
    for skill_name in GCP_SKILLS:
        s_dir = dst_skills / skill_name
        t_dir = gcp_pack_dir / skill_name
        if s_dir.exists() and not t_dir.exists():
            if dry_run:
                print(f"[DRY-RUN] archive GCP skill {s_dir} -> {t_dir}")
            else:
                shutil.move(str(s_dir), str(t_dir))
            archived_count += 1

    installed_skills = 0
    for entry in sorted(src_skills.iterdir()):
        if entry.is_dir() and (entry / "SKILL.md").is_file():
            sync_tree(entry, dst_skills / entry.name, dry_run)
            installed_skills += 1

    print(f"[OK] Skill GCP archiviate in skills-packs/gcp-data-pack: {archived_count}")
    print(f"[OK] Nuove Skill installate in {dst_skills}: {installed_skills}")
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Installa suite Antigravity v4.0.0 in ~/.gemini/config")
    parser.add_argument("--dry-run", action="store_true", help="Mostra operazioni senza scrivere")
    parser.add_argument(
        "--config-dir",
        type=Path,
        default=Path.home() / ".gemini" / "config",
        help="Percorso ~/.gemini/config",
    )
    args = parser.parse_args(argv)
    repo_root = Path(__file__).resolve().parents[1]
    return install_all(repo_root, args.config_dir.resolve(), args.dry_run)


if __name__ == "__main__":
    sys.exit(main())

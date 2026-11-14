#!/usr/bin/env python3
"""Unit test per security_linter.py, unify_memory.py e doctest_docs.py."""

from __future__ import annotations

import json
import sys
import tempfile
import unittest
from pathlib import Path

HOOKS_DIR = Path(__file__).resolve().parent
SCRIPTS_DIR = HOOKS_DIR.parent
sys.path.insert(0, str(HOOKS_DIR))
sys.path.insert(0, str(SCRIPTS_DIR))

import doctest_docs  # noqa: E402
import security_linter  # noqa: E402
import unify_memory  # noqa: E402


class HooksAndDoctestSuite(unittest.TestCase):
    def test_security_linter_flags_yaml_password_fallback_and_secrets(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            compose = root / "docker-compose.yml"
            compose.write_text("environment:\n  DB_PASSWORD: ${DB_PASSWORD:-weakdefault}\n", encoding="utf-8")
            self.assertEqual(security_linter.run_checks(root), 1)

            compose.write_text("environment:\n  DB_PASSWORD: ${DB_PASSWORD:?missing}\n", encoding="utf-8")
            self.assertEqual(security_linter.run_checks(root), 0)

    def test_security_linter_flags_private_key_file(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "deploy.pem").write_text("dummy", encoding="utf-8")
            self.assertEqual(security_linter.run_checks(root), 1)

    def test_unify_memory_tracks_malformed_lines_and_project_scope(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            brain = Path(tmp) / "brain"
            mem_dir = brain / "memory"
            mem_dir.mkdir(parents=True)
            node_file = mem_dir / "memory_mac1.jsonl"
            node_file.write_text(
                "\n".join([
                    json.dumps({"type": "entity", "project": "visability", "name": "GeoApp", "entityType": "App", "observations": ["v1"]}),
                    "{broken_json_line",
                    json.dumps({"type": "entity", "project": "fenice", "name": "FeniceApp", "entityType": "App", "observations": ["v2"]}),
                ]) + "\n",
                encoding="utf-8",
            )
            out_all = Path(tmp) / "unified_all.jsonl"
            stats_all = unify_memory.consolidate_memory(brain, out_all)
            self.assertEqual(stats_all["entities"], 2)
            self.assertEqual(stats_all["malformed_lines"], 1)

            out_vis = Path(tmp) / "unified_vis.jsonl"
            stats_vis = unify_memory.consolidate_memory(brain, out_vis, project_filter="visability")
            self.assertEqual(stats_vis["entities"], 1)

    def test_unify_memory_scrubs_pii_and_local_paths(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            brain = Path(tmp) / "brain"
            mem_dir = brain / "memory"
            mem_dir.mkdir(parents=True)
            node_file = mem_dir / "memory_node.jsonl"
            node_file.write_text(
                json.dumps({
                    "type": "entity",
                    "project": "compliance",
                    "name": "SecretHolder",
                    "entityType": "Config",
                    "observations": [
                        "Path: /Users/john_doe/secret.key",
                        "Auth: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.dummysecret",
                        "password: supersecretpassword123"
                    ]
                }) + "\n",
                encoding="utf-8"
            )
            out_file = Path(tmp) / "unified.jsonl"
            unify_memory.consolidate_memory(brain, out_file)
            content = out_file.read_text(encoding="utf-8")
            self.assertNotIn("/Users/john_doe", content)
            self.assertIn("~", content)
            self.assertNotIn("eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9", content)
            self.assertIn("Bearer [REDACTED]", content)

    def test_doctest_detects_broken_link_and_bad_json(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            md = root / "README.md"
            md.write_text("# Test\n\n[Missing](nope/missing.md)\n\n```json\n{bad}\n```\n", encoding="utf-8")
            self.assertEqual(doctest_docs.run_doctest(root), 1)

            (root / "ok.md").write_text("# Ok\n", encoding="utf-8")
            md.write_text("# Test\n\n[Ok](ok.md)\n\n```json\n{\"ok\": true}\n```\n", encoding="utf-8")
            self.assertEqual(doctest_docs.run_doctest(root), 0)


if __name__ == "__main__":
    unittest.main()

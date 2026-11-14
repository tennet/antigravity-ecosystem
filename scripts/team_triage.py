#!/usr/bin/env python3
"""
team_triage.py — Antigravity Team Discovery, Dynamic Roster & Triage Engine
Permette ad Alan Turing (Project Orchestrator) e al sistema Antigravity di:
1. Scoprire dinamicamente TUTTI gli agenti registrati (inclusi nuovi agenti aggiunti nel tempo)
2. Mappare le skill disponibili per ciascun agente
3. Eseguire il triage automatico di qualsiasi richiesta dell'utente per decidere chi mettere in gioco
"""

import os
import sys
import re
import glob
import json
import argparse
from typing import Dict, List, Any

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
ROOT_DIR = os.path.abspath(os.path.join(SCRIPT_DIR, '..'))
AGENTS_DIR = os.path.join(ROOT_DIR, 'portable', 'engineering-team', 'agents')
SKILLS_DIR = os.path.join(ROOT_DIR, 'skills')
REFERENCES_DIR = os.path.join(ROOT_DIR, 'portable', 'engineering-team', 'references')

def parse_frontmatter(content: str) -> Dict[str, str]:
    meta = {}
    if content.startswith('---'):
        parts = content.split('---', 2)
        if len(parts) >= 3:
            fm_text = parts[1]
            for line in fm_text.splitlines():
                line = line.strip()
                if line.startswith('#') or not line:
                    continue
                if ':' in line:
                    k, v = line.split(':', 1)
                    meta[k.strip()] = v.strip().strip('"').strip("'")
    return meta

def scan_skills() -> Dict[str, Dict[str, Any]]:
    skills = {}
    if not os.path.exists(SKILLS_DIR):
        return skills
    for skill_name in os.listdir(SKILLS_DIR):
        skill_path = os.path.join(SKILLS_DIR, skill_name, 'SKILL.md')
        if os.path.isfile(skill_path):
            try:
                with open(skill_path, 'r', encoding='utf-8') as f:
                    content = f.read()
                fm = parse_frontmatter(content)
                desc = fm.get('description', '')
                if not desc:
                    lines = content.splitlines()
                    for l in lines:
                        if l.strip() and not l.startswith('#') and not l.startswith('---'):
                            desc = l.strip()
                            break
                skills[skill_name] = {
                    'name': fm.get('name', skill_name),
                    'description': desc,
                    'path': skill_path
                }
            except Exception:
                continue
    return skills

def scan_team_roster() -> Dict[str, Dict[str, Any]]:
    skills = scan_skills()
    roster = {}
    if not os.path.exists(AGENTS_DIR):
        return roster

    alias_map = {}
    canonical_files = {}

    for fpath in glob.glob(os.path.join(AGENTS_DIR, '*.md')):
        fname = os.path.basename(fpath)
        stem = fname[:-3]
        try:
            with open(fpath, 'r', encoding='utf-8') as f:
                content = f.read()
            fm = parse_frontmatter(content)
            desc = fm.get('description', '')
            is_alias = False
            alias_match = re.search(r'Alias rapido di\s+`?([a-z0-9-]+)`?', desc, re.IGNORECASE) or \
                          re.search(r'Invocabile direttamente in chat con\s+\*?\*?`?@([a-z0-9-]+)`?\*?\*?', content)
            
            # Check if this file is a short alias pointing to a canonical role
            if 'Alias rapido di' in desc or 'Alias rapido di' in content:
                m = re.search(r'Alias rapido di\s+`?([a-z0-9-]+)`?', desc + ' ' + content)
                if m:
                    target_role = m.group(1).strip()
                    alias_map[stem] = target_role
                    is_alias = True

            if not is_alias:
                canonical_files[stem] = {
                    'name': fm.get('name', stem),
                    'description': desc,
                    'file': fname,
                    'path': fpath,
                    'content': content
                }
        except Exception:
            continue

    # Build consolidated roster
    # Invert alias_map to find alias for canonical, giving priority to canonical aliases
    PRIMARY_ALIASES = {
        'ai-systems-engineer': 'karpathy',
        'software-architect': 'werner',
        'polyglot-backend-sage': 'taylor',
        'devops-infra-sage': 'linus',
        'ethical-hacker-redteam': 'mitnick',
        'ui-ux-designer': 'steve',
        'qa-engineer': 'carmack',
        'integration-tester': 'rauch',
        'security-auditor': 'geohot',
        'privacy-compliance-counsel': 'dpo',
        'documentation-engineer': 'guido',
        'project-orchestrator': 'turing',
    }
    canonical_to_alias = {}
    for alias, canon in alias_map.items():
        canonical_to_alias[canon] = alias
    for canon, pri_alias in PRIMARY_ALIASES.items():
        if canon in canonical_files:
            canonical_to_alias[canon] = pri_alias

    for canon, data in canonical_files.items():
        alias = canonical_to_alias.get(canon, canon)
        # Match linked skills by keyword in skill descriptions and agent roles
        linked_skills = []
        for sk_name, sk_data in skills.items():
            sk_desc_lower = sk_data['description'].lower()
            if alias in sk_desc_lower or canon in sk_desc_lower:
                linked_skills.append(sk_name)
            elif (canon == 'ui-ux-designer' or alias == 'steve') and ('tailwind' in sk_name or 'ui' in sk_name or 'html' in sk_name):
                linked_skills.append(sk_name)
            elif (canon == 'devops-infra-sage' or alias == 'linus') and ('docker' in sk_name or 'proxmox' in sk_name or 'stackcp' in sk_name or 'cloud' in sk_name):
                linked_skills.append(sk_name)
            elif (canon == 'polyglot-backend-sage' or alias == 'taylor') and ('laravel' in sk_name or 'nodejs' in sk_name or 'etl' in sk_name):
                linked_skills.append(sk_name)
            elif (canon == 'qa-engineer' or alias == 'carmack') and ('test' in sk_name):
                linked_skills.append(sk_name)
            elif (canon == 'security-auditor' or alias == 'geohot') and ('security' in sk_name or 'auth' in sk_name):
                linked_skills.append(sk_name)
            elif (canon == 'ethical-hacker-redteam' or alias == 'mitnick') and ('security' in sk_name or 'auth' in sk_name):
                linked_skills.append(sk_name)
            elif (canon == 'ai-systems-engineer' or alias in ('karpathy', 'andrej')) and ('ai' in sk_name or 'llm' in sk_name):
                linked_skills.append(sk_name)
            elif (canon == 'privacy-compliance-counsel' or alias == 'dpo') and ('gdpr' in sk_name or 'evidence' in sk_name):
                linked_skills.append(sk_name)
            elif (canon == 'documentation-engineer' or alias == 'guido') and ('doc' in sk_name or 'doctest' in sk_name):
                linked_skills.append(sk_name)

        # Match canon book
        canon_file = None
        if os.path.exists(REFERENCES_DIR):
            for ref in os.listdir(REFERENCES_DIR):
                if ref.endswith('.md') and not ref.startswith('INDEX'):
                    # Check if reference mentions this agent or role
                    try:
                        with open(os.path.join(REFERENCES_DIR, ref), 'r', encoding='utf-8') as rf:
                            ref_txt = rf.read(1000)
                            if alias in ref_txt or canon in ref_txt or (alias == 'karpathy' and 'andrej' in ref_txt):
                                canon_file = ref
                                break
                    except Exception:
                        pass

        roster[alias] = {
            'alias': f"@{alias}",
            'canonicalRole': canon,
            'displayName': data['name'],
            'description': data['description'],
            'linkedSkills': sorted(list(set(linked_skills))),
            'canonBook': canon_file,
            'sourceFile': data['file']
        }

    return roster

# Keyword routing dictionary for rapid triage scoring
AI_KEYWORDS = [
    'ai', 'llm', 'openai', 'gemini', 'claude', 'prompt', 'eval', 'evals', 'token budget',
    'fallback', 'modello linguistico', 'inference', 'embedding', 'rag', 'argon', 'deep research',
    'notebooklm', 'gemini notebook', 'jules', 'antigravity', 'veo', 'nano banana', 'flow',
    'canvas', 'gems', 'gemini live', 'spark', 'colab', 'ai studio', 'google flow', 'google ai'
]

DOMAIN_KEYWORD_RULES = {
    'steve': ['grafica', 'ui', 'ux', 'css', 'tailwind', 'stile', 'design', 'layout', 'bento', 'dark', 'light', 'colore', 'palette', 'schermata', 'interfaccia', 'bottone', 'svg', 'animazione', 'visual', 'estetica', 'html'],
    'linus': ['linux', 'pc', 'server', 'docker', 'porta', 'host', 'deploy', 'proxmox', 'caddy', 'stackcp', 'bash', 'script', 'processo', 'macchina', 'sistema operativo', 'os', 'rete', 'ip', 'systemd', 'launchd'],
    'taylor': ['backend', 'database', 'db', 'sql', 'mysql', 'postgres', 'sqlite', 'query', 'laravel', 'php', 'node', 'api', 'controller', 'migration', 'modello', 'lock', 'n+1', 'json', 'dati', 'transazione'],
    'carmack': ['test', 'qa', 'crash', 'boundary', 'nan', 'inf', 'resilienza', 'bug', 'difetto', 'affidabilita', 'copertura', 'assert', 'fallimento', 'errore', 'mock', 'stress', 'regressione'],
    'geohot': ['sicurezza', 'audit', 'owasp', 'vulnerabilita', 'token', 'auth', 'csp', 'veto', 'xss', 'ssrf', 'injection', 'bypass', 'jwt', 'segreto', 'chiave', 'permessi'],
    'mitnick': ['penetration test', 'red team', 'hacker', 'ethical hacking', 'ricognizione', 'porte aperte', 'sonde', 'falla', 'social engineering', 'perimetro', 'attacco', 'exploit'],
    'karpathy': AI_KEYWORDS,
    'andrej': AI_KEYWORDS,
    'dpo': ['privacy', 'gdpr', 'dati personali', 'dpia', 'art. 28', 'consenso', 'retention', 'probatorio', 'eidas', 'cad', 'agid', 'conformita', 'legale'],
    'werner': ['architettura', 'contratto api', 'sistema', 'scalabilita', 'cloud', 'openapi', 'microservizi', 'resilience', 'failover', 'design architetturale', 'confini'],
    'guido': ['documentazione', 'readme', 'guida', 'diataxis', 'doctest', 'manuale', 'adr', 'decision_log', 'spiegazione', 'leggibilita', 'docs-as-code'],
    'rauch': ['integrazione', 'e2e', 'end-to-end', 'rete reale', 'sse', 'socket', 'lattenza', 'circuit breaker', 'streaming', 'flusso continuo'],
    'turing': ['coordinamento', 'progetto', 'piano', '5 fasi', 'fasi', 'fase', 'raci', 'governance', 'quorum', 'triage', 'squadra', 'team', 'orchestratore']
}

def triage_request(request_text: str) -> Dict[str, Any]:
    text_lower = request_text.lower()
    roster = scan_team_roster()
    scores = {}

    for alias in roster.keys():
        scores[alias] = 0

    # Match explicit mentions (@alias and synonyms)
    for alias in roster.keys():
        if f"@{alias}" in text_lower:
            scores[alias] += 100
        if alias == 'karpathy' and ('@andrej' in text_lower or '@karpathy' in text_lower or 'andrej' in text_lower):
            scores[alias] += 100

    # Match domain keywords
    for alias, keywords in DOMAIN_KEYWORD_RULES.items():
        if alias in scores:
            for kw in keywords:
                if kw in text_lower:
                    scores[alias] += 15

    # Match words in agent description and skills
    for alias, spec in roster.items():
        desc_words = re.findall(r'\b[a-zA-Z]{4,}\b', spec['description'].lower())
        for dw in desc_words:
            if dw in text_lower:
                scores[alias] += 5
        for sk in spec['linkedSkills']:
            if sk.replace('-', ' ') in text_lower:
                scores[alias] += 20

    ranked = sorted(scores.items(), key=lambda x: x[1], reverse=True)
    top_matches = [r for r in ranked if r[1] > 0]

    primary_agent = top_matches[0][0] if top_matches else 'turing'
    secondary_agents = [r[0] for r in top_matches[1:3]] if len(top_matches) > 1 else []

    agent_spec = roster.get(primary_agent, {})

    return {
        'request': request_text,
        'primarySpecialist': {
            'alias': f"@{primary_agent}",
            'agentKey': primary_agent,
            'canonicalRole': agent_spec.get('canonicalRole', 'project-orchestrator'),
            'displayName': agent_spec.get('displayName', 'Specialista'),
            'score': top_matches[0][1] if top_matches else 0,
            'linkedSkills': agent_spec.get('linkedSkills', []),
            'canonBook': agent_spec.get('canonBook', None)
        },
        'consultingSpecialists': [
            {
                'alias': f"@{sec}",
                'canonicalRole': roster.get(sec, {}).get('canonicalRole', ''),
                'score': scores[sec]
            }
            for sec in secondary_agents
        ],
        'triageReason': f"Identificato match di dominio primario su {primary_agent} ({agent_spec.get('canonicalRole')})",
        'readyPrompt': f"@{primary_agent} [TASK]: {request_text}"
    }

def print_roster():
    roster = scan_team_roster()
    print(f"\n👥 Antigravity Active Team Roster ({len(roster)} Specialisti Rilevati):\n" + "=" * 70)
    for alias, info in sorted(roster.items()):
        skills_str = ", ".join(info['linkedSkills']) if info['linkedSkills'] else "Nessuna skill specifica"
        canon_str = info['canonBook'] or "N/D"
        print(f"🔹 {info['alias']} ({info['canonicalRole']}) — {info['displayName']}")
        print(f"   Descrizione : {info['description'][:85]}...")
        print(f"   Canone      : {canon_str}")
        print(f"   Skill attive: {skills_str}")
        print("-" * 70)
    print()

def main():
    parser = argparse.ArgumentParser(description="Antigravity Team Roster & Triage Engine")
    parser.add_argument('--roster', action='store_true', help="Mostra il roster completo e dinamico della squadra")
    parser.add_argument('--triage', type=str, help="Esegui il triage automatico su una richiesta utente")
    parser.add_argument('--json', action='store_true', help="Restituisci output in formato JSON")

    args = parser.parse_args()

    if args.roster:
        if args.json:
            print(json.dumps(scan_team_roster(), indent=2, ensure_ascii=False))
        else:
            print_roster()
    elif args.triage:
        res = triage_request(args.triage)
        if args.json:
            print(json.dumps(res, indent=2, ensure_ascii=False))
        else:
            p = res['primarySpecialist']
            print("\n🎯 Risultato Triage Ingegneristico:\n" + "=" * 60)
            print(f" Specialista Primario : {p['alias']} ({p['canonicalRole']})")
            print(f" Motivo del Triage    : {res['triageReason']}")
            if res['consultingSpecialists']:
                consulting = ", ".join([c['alias'] for c in res['consultingSpecialists']])
                print(f" Esperti da Consultare: {consulting}")
            print(f" Skill collegate      : {', '.join(p['linkedSkills']) if p['linkedSkills'] else 'Nessuna'}")
            print(f" Prompt Formattato    : {res['readyPrompt']}")
            print("=" * 60 + "\n")
    else:
        parser.print_help()

if __name__ == '__main__':
    main()

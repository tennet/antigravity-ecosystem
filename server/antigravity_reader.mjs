/**
 * antigravity_reader.mjs — Read-only sanitized Antigravity brain & session reader.
 * Strictly zero child_process usage, streaming tail reads, symlink protection,
 * and strict allowlist sanitization (never leaks secrets, raw prompts, or file bodies).
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const CANONICAL_AGENTS = [
  'turing', 'werner', 'taylor', 'karpathy', 'linus', 'mitnick',
  'steve', 'carmack', 'rauch', 'geohot', 'dpo', 'guido'
];

export const FENICE_AGENTS = ['pacioli', 'biagi', 'munari'];
export const ALL_STATION_AGENTS = [...CANONICAL_AGENTS, ...FENICE_AGENTS];

const AGENT_ALIASES = {
  'turing': 'turing',
  'project-orchestrator': 'turing',
  'orchestrator': 'turing',
  'coordinator': 'turing',
  'werner': 'werner',
  'software-architect': 'werner',
  'architect': 'werner',
  'taylor': 'taylor',
  'polyglot-backend-sage': 'taylor',
  'backend': 'taylor',
  'karpathy': 'karpathy',
  'andrej': 'karpathy',
  'andrej-karpathy': 'karpathy',
  'ai-systems-engineer': 'karpathy',
  'ai-systems': 'karpathy',
  'ai-engineer': 'karpathy',
  'linus': 'linus',
  'devops-infra-sage': 'linus',
  'devops': 'linus',
  'mitnick': 'mitnick',
  'ethical-hacker-redteam': 'mitnick',
  'ethical-hacker': 'mitnick',
  'redteam': 'mitnick',
  'red-team': 'mitnick',
  'pentester': 'mitnick',
  'hacker': 'mitnick',
  'steve': 'steve',
  'ui-ux-designer': 'steve',
  'designer': 'steve',
  'image-generator': 'steve',
  'carmack': 'carmack',
  'qa-engineer': 'carmack',
  'qa': 'carmack',
  'rauch': 'rauch',
  'integration-tester': 'rauch',
  'integration': 'rauch',
  'browser': 'rauch',
  'geohot': 'geohot',
  'security-auditor': 'geohot',
  'security': 'geohot',
  'dpo': 'dpo',
  'privacy-compliance-counsel': 'dpo',
  'privacy': 'dpo',
  'gdpr': 'dpo',
  'compliance': 'dpo',
  'guido': 'guido',
  'documentation-engineer': 'guido',
  'docs': 'guido',
  'research': 'werner',
  'self': 'turing',
  'pacioli': 'pacioli',
  'fiscal-accounting-sage': 'pacioli',
  'fiscal': 'pacioli',
  'biagi': 'biagi',
  'payroll-labor-sage': 'biagi',
  'payroll': 'biagi',
  'munari': 'munari',
  'plain-language-simplifier': 'munari',
  'simplifier': 'munari'
};

const CONV_ID_RE = /^[a-zA-Z0-9_-]{8,80}$/;
const MAX_TAIL_BYTES = 512 * 1024;
const MAX_SUBAGENT_TAIL_BYTES = 256 * 1024;
const MAX_JSON_FILE_BYTES = 128 * 1024;
const MAX_CONVERSATIONS_SCAN = 20;
const MAX_SUBAGENTS_SCAN = 25;
const MAX_SUBAGENT_DEPTH = 4;
const SNAPSHOT_CACHE_TTL_MS = 250;
const ACTIVE_WINDOW_MS = 45 * 1000;
const SUBAGENT_ALIVE_WINDOW_MS = 12 * 60 * 1000;
const FINAL_ACK_WINDOW_MS = 14 * 1000;
const REPLY_TRANSFER_WINDOW_MS = 18 * 1000;
const FENICE_WINDOW_MS = 15 * 60 * 1000;

const snapshotCache = new Map();

/**
 * Normalizes a candidate timestamp and clamps future clock skew to maxMs.
 */
function normalizeStepTimestamp(raw, fallbackMs, maxMs = Date.now()) {
  const safeMax = Number.isFinite(maxMs) ? maxMs : Date.now();
  const safeFallback = Math.min(Number.isFinite(fallbackMs) && fallbackMs >= 0 ? fallbackMs : safeMax, safeMax);
  let ms = safeFallback;
  if (typeof raw === 'number' && Number.isFinite(raw) && raw >= 0) {
    ms = raw;
  } else if (typeof raw === 'string' && raw.trim()) {
    const parsed = Date.parse(raw.trim());
    if (Number.isFinite(parsed) && parsed >= 0) {
      ms = parsed;
    }
  }
  const clampedMs = Math.min(ms, safeMax);
  return { ms: clampedMs, iso: new Date(clampedMs).toISOString() };
}

/**
 * Resolves a nested directory under baseRealDir while blocking symlinks on every segment.
 */
export function resolveSafeSubdir(baseRealDir, ...segments) {
  if (!baseRealDir) return null;
  const basePrefix = baseRealDir.endsWith(path.sep) ? baseRealDir : baseRealDir + path.sep;
  let current = baseRealDir;
  for (const seg of segments) {
    if (!seg || typeof seg !== 'string' || seg === '.' || seg === '..' || seg.includes('/') || seg.includes('\\') || seg.includes('\0')) {
      return null;
    }
    current = path.join(current, seg);
    try {
      const st = fs.lstatSync(current);
      if (st.isSymbolicLink() || !st.isDirectory()) return null;
    } catch {
      return null;
    }
  }
  try {
    const real = fs.realpathSync(current);
    if (!real.startsWith(basePrefix)) return null;
    return real;
  } catch {
    return null;
  }
}

/**
 * Redacts potential secrets, tokens, credentials, and host-specific absolute paths.
 */
export function sanitizeSummary(raw, workspaceNames = []) {
  if (!raw || typeof raw !== 'string') return '';
  let text = raw
    .slice(0, 2048)
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();

  // Redact common secret patterns
  text = text
    .replace(/\bBearer\s+[A-Za-z0-9._\-+/=]{8,}/gi, 'Bearer [REDACTED]')
    .replace(/\b(?:sk-|ghp_|gho_|github_pat_|AIza)[A-Za-z0-9_\-]{10,}/g, '[REDACTED_TOKEN]')
    .replace(/\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}(?:\.[A-Za-z0-9_-]{6,})?/g, '[REDACTED_JWT]')
    .replace(/\b([A-Za-z0-9_]*(?:PASSWORD|SECRET|TOKEN|API_KEY))\s*[:=]\s*[^\s,;'"`]+/gi, (_, key) => `${key}=[REDACTED]`)
    .replace(/([?&](?:token|key|secret|auth|password)=)[^&\s]+/gi, '$1[REDACTED]');

  // Strip local user home prefixes cleanly to workspace-relative or basename
  text = text.replace(/\/Users\/[^/\s]+\/[^\n\r"'`)]+/g, (fullPath) => shortenPath(fullPath, workspaceNames));
  text = text.replace(/\/home\/[^/\s]+\/[^\n\r"'`)]+/g, (fullPath) => shortenPath(fullPath, workspaceNames));
  text = text.replace(/[A-Za-z]:\\Users\\[^\\\s]+\\[^\n\r"'`)]+/gi, (fullPath) => shortenPath(fullPath, workspaceNames));

  if (text.length > 96) {
    text = text.slice(0, 93).trimEnd() + '...';
  }
  return text;
}

export function shortenPath(fullPath, workspaceNames = []) {
  if (!fullPath || typeof fullPath !== 'string') return '';
  const cleaned = fullPath.replace(/^file:\/\//i, '').replace(/\\/g, '/').replace(/^["']|["']$/g, '');
  for (const ws of workspaceNames) {
    const marker = `/${ws}/`;
    const idx = cleaned.indexOf(marker);
    if (idx !== -1) {
      return cleaned.slice(idx + marker.length).slice(0, 64);
    }
  }
  const parts = cleaned.split('/').filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[parts.length - 2]}/${parts[parts.length - 1]}`.slice(0, 64);
  }
  return (parts[parts.length - 1] || cleaned).slice(0, 64);
}

export function resolveBrainDir(customDir) {
  const candidate = customDir || process.env.ANTIGRAVITY_BRAIN_DIR || path.join(os.homedir(), '.gemini', 'antigravity', 'brain');
  const resolved = path.resolve(candidate);
  let st;
  try {
    st = fs.lstatSync(resolved);
  } catch (err) {
    if (err && err.code === 'ENOENT') return null;
    throw err;
  }
  if (st.isSymbolicLink() || !st.isDirectory()) {
    throw new Error('Brain directory is invalid or symlinked');
  }
  return fs.realpathSync(resolved);
}

function isSafeRegularFile(baseRealDir, targetPath, maxBytes = MAX_JSON_FILE_BYTES) {
  try {
    const lstat = fs.lstatSync(targetPath);
    if (lstat.isSymbolicLink() || !lstat.isFile()) return null;
    if (lstat.size > maxBytes) return null;
    const real = fs.realpathSync(targetPath);
    const basePrefix = baseRealDir.endsWith(path.sep) ? baseRealDir : baseRealDir + path.sep;
    if (!real.startsWith(basePrefix)) return null;
    return { real, stat: lstat };
  } catch {
    return null;
  }
}

function readTailLines(baseRealDir, filePath, maxBytes = MAX_TAIL_BYTES) {
  try {
    const lstat = fs.lstatSync(filePath);
    if (lstat.isSymbolicLink() || !lstat.isFile()) return { lines: [], mtimeMs: 0 };
    const real = fs.realpathSync(filePath);
    const basePrefix = baseRealDir.endsWith(path.sep) ? baseRealDir : baseRealDir + path.sep;
    if (!real.startsWith(basePrefix)) return { lines: [], mtimeMs: 0 };

    const openFlags = fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0);
    const fd = fs.openSync(real, openFlags);
    let size = lstat.size;
    let mtimeMs = lstat.mtimeMs;
    let totalRead = 0;
    let start = 0;
    let buf;
    try {
      const fst = fs.fstatSync(fd);
      if (!fst.isFile()) return { lines: [], mtimeMs: 0 };
      size = fst.size;
      mtimeMs = fst.mtimeMs;
      if (size === 0) return { lines: [], mtimeMs };
      start = Math.max(0, size - maxBytes);
      const length = size - start;
      buf = Buffer.alloc(length);
      while (totalRead < length) {
        const n = fs.readSync(fd, buf, totalRead, length - totalRead, start + totalRead);
        if (n <= 0) break;
        totalRead += n;
      }
    } finally {
      fs.closeSync(fd);
    }
    let rawLines = buf.subarray(0, totalRead).toString('utf8').split(/\r?\n/);
    if (start > 0 && rawLines.length > 1) {
      rawLines = rawLines.slice(1);
    }
    const parsed = [];
    for (const line of rawLines) {
      if (!line.trim()) continue;
      try {
        parsed.push(JSON.parse(line));
      } catch {
        // Tolerate partially flushed JSONL tail line
      }
    }
    return { lines: parsed, mtimeMs };
  } catch {
    return { lines: [], mtimeMs: 0 };
  }
}

function normalizeAgentKey(typeName, roleText = '') {
  const t = String(typeName || '').trim().toLowerCase();
  if (AGENT_ALIASES[t]) return AGENT_ALIASES[t];
  const combined = `${t} ${String(roleText || '').toLowerCase()}`;
  for (const [alias, canonical] of Object.entries(AGENT_ALIASES)) {
    if (alias.length >= 4 && combined.includes(alias)) return canonical;
  }
  return null;
}

function inferSpecialistFromTool(toolName, parsedArgs) {
  const tName = String(toolName || '').trim();
  const pathStr = String(parsedArgs.Path || '').toLowerCase();
  const summaryStr = String(parsedArgs.toolSummary || '').toLowerCase();
  const cmdStr = String(parsedArgs.CommandLine || '').toLowerCase();

  // 1. Carmack (QA & Tests)
  if (
    summaryStr.includes('test') || summaryStr.includes('tdd') ||
    cmdStr.includes('.test.') || cmdStr.includes('pytest') || cmdStr.includes('node:test') ||
    cmdStr.includes('npm test') || cmdStr.includes('doctest') || pathStr.includes('.test.') ||
    pathStr.includes('/tests/') || pathStr.includes('test_')
  ) {
    return 'carmack';
  }

  // 2. Steve (Frontend, UI/UX, Design, Blade, HTML/CSS)
  if (
    pathStr.endsWith('.html') || pathStr.endsWith('.css') || pathStr.includes('tailwind') ||
    pathStr.includes('.blade.php') ||
    summaryStr.includes('ui') || summaryStr.includes('design') || summaryStr.includes('frontend') ||
    summaryStr.includes('css') || summaryStr.includes('html') || summaryStr.includes('bento')
  ) {
    return 'steve';
  }

  // 3. Linus (DevOps, Docker, Hosting, Caddy, Scripts)
  if (
    pathStr.includes('docker') || pathStr.endsWith('.dockerignore') || pathStr.includes('caddy') ||
    pathStr.includes('nginx') || pathStr.endsWith('.sh') || pathStr.endsWith('.ps1') ||
    summaryStr.includes('docker') || summaryStr.includes('deploy') || summaryStr.includes('port') ||
    summaryStr.includes('container') || cmdStr.includes('docker') || cmdStr.includes('caddy')
  ) {
    return 'linus';
  }

  // 4. Geohot (Security Audit, OWASP, Secret Protection)
  if (
    pathStr.includes('security_linter') || summaryStr.includes('security') || summaryStr.includes('audit') ||
    summaryStr.includes('owasp') || summaryStr.includes('vulnerab') || summaryStr.includes('leak')
  ) {
    return 'geohot';
  }

  // 5. Andrej (AI Systems, Gemini Ecosystem, Evals, LLM)
  if (
    summaryStr.includes('gemini') || summaryStr.includes('eval') || summaryStr.includes('llm') ||
    summaryStr.includes('argon') || summaryStr.includes('deep research') || pathStr.includes('evals')
  ) {
    return 'andrej';
  }

  // 6. DPO (GDPR & Privacy Compliance)
  if (
    summaryStr.includes('gdpr') || summaryStr.includes('privacy') || summaryStr.includes('dpia') ||
    summaryStr.includes('eidas') || summaryStr.includes('probatorio')
  ) {
    return 'dpo';
  }

  // 7. Mitnick (Red Team & Ethical Hacking)
  if (
    summaryStr.includes('redteam') || summaryStr.includes('pentest') || summaryStr.includes('exploit') ||
    summaryStr.includes('attack surface')
  ) {
    return 'mitnick';
  }

  // 8. Guido (Documentation Engineer & Docs-as-Code)
  if (
    pathStr.endsWith('readme.md') || pathStr.endsWith('vademecum.md') || pathStr.includes('/references/') ||
    summaryStr.includes('doc') || summaryStr.includes('vademecum') || summaryStr.includes('diataxis')
  ) {
    return 'guido';
  }

  // 9. Rauch (Integration & E2E Testing)
  if (
    summaryStr.includes('integration') || summaryStr.includes('e2e') || summaryStr.includes('sse') ||
    summaryStr.includes('stream') || summaryStr.includes('socket')
  ) {
    return 'rauch';
  }

  // 10. Werner (Software Architecture & Schemas)
  if (
    summaryStr.includes('architect') || summaryStr.includes('openapi') || summaryStr.includes('schema') ||
    summaryStr.includes('contratto api')
  ) {
    return 'werner';
  }

  // 11. Taylor (Backend & Database)
  if (
    pathStr.endsWith('.php') || pathStr.includes('migration') || pathStr.includes('/database/') ||
    summaryStr.includes('backend') || summaryStr.includes('database') || summaryStr.includes('sql') ||
    summaryStr.includes('laravel') || summaryStr.includes('query')
  ) {
    return 'taylor';
  }

  return null;
}

function detectFeniceSignal(text, workspaceName = '') {
  const hay = `${workspaceName} ${text || ''}`.toLowerCase();
  return (
    hay.includes('fenice') ||
    hay.includes('pacioli') ||
    hay.includes('biagi') ||
    hay.includes('munari') ||
    hay.includes('tridente') ||
    hay.includes('fiscal') ||
    hay.includes('paghe') ||
    hay.includes('payroll') ||
    hay.includes('reconcilebalance') ||
    hay.includes('simulatecashflow')
  );
}

function parseJsonArgs(rawArgs) {
  let source = rawArgs;
  if (typeof source === 'string') {
    const trimmed = source.trim();
    if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
      try {
        source = JSON.parse(trimmed);
      } catch {
        return {};
      }
    } else {
      return {};
    }
  }
  if (!source || typeof source !== 'object' || Array.isArray(source)) return {};
  const out = {};
  for (const [k, v] of Object.entries(source)) {
    if (typeof v === 'string') {
      const trimmed = v.trim();
      if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || trimmed.startsWith('{') || trimmed.startsWith('[')) {
        try {
          out[k] = JSON.parse(trimmed);
          continue;
        } catch {
          // keep string
        }
      }
      out[k] = trimmed;
    } else {
      out[k] = v;
    }
  }
  return out;
}

function describeToolAction(toolName, parsedArgs, workspaceNames) {
  const name = String(toolName || '').trim();
  if (name === 'read_file') {
    const target = shortenPath(String(parsedArgs.Path || ''), workspaceNames);
    return { status: 'inspecting', label: target ? `Legge ${target}` : 'Legge file' };
  }
  if (name === 'edit_file' || name === 'write_file') {
    const target = shortenPath(String(parsedArgs.Path || ''), workspaceNames);
    const actionVerb = name === 'write_file' ? 'Crea' : 'Modifica';
    return { status: 'creating', label: target ? `${actionVerb} ${target}` : (name === 'write_file' ? 'Crea file' : 'Modifica codice') };
  }
  if (name === 'run_command') {
    const summary = parsedArgs.toolSummary ? sanitizeSummary(String(parsedArgs.toolSummary), workspaceNames) : 'Esegue comando verifica';
    return { status: 'working', label: summary };
  }
  if (name === 'invoke_subagent') {
    const targetType = parsedArgs.TypeName || parsedArgs.Role || 'subagent';
    return { status: 'reviewing', label: `Delega a ${sanitizeSummary(String(targetType), workspaceNames)}` };
  }
  if (name === 'send_message') {
    return { status: 'reviewing', label: 'Coordina team via messaggio' };
  }
  if (name === 'swarm') {
    const act = sanitizeSummary(String(parsedArgs.action || 'status'), workspaceNames) || 'status';
    const targetName = parsedArgs.name ? sanitizeSummary(String(parsedArgs.name), workspaceNames) : '';
    if (act === 'add') return { status: 'working', label: targetName ? `Swarm +@${targetName}` : 'Avvia worker swarm' };
    if (act === 'model') return { status: 'reviewing', label: targetName ? `Switch modello @${targetName}` : 'Cambio modello swarm' };
    return { status: 'inspecting', label: `Swarm: ${act}` };
  }
  if (name === 'ask_question') {
    return { status: 'reviewing', label: 'Attende conferma utente' };
  }
  if (name === 'search_web' || name === 'search_marketplace') {
    return { status: 'inspecting', label: 'Ricerca documentazione' };
  }
  return { status: 'working', label: sanitizeSummary(name || 'Elaborazione attiva', workspaceNames) };
}

function inferVerdictTone(content) {
  if (!content || typeof content !== 'string') return null;
  if (content.includes('[RESPINTO]')) return { status: 'veto', tag: '[RESPINTO]', tone: 'rose' };
  if (content.includes('[APPROVATO]')) return { status: 'approved', tag: '[APPROVATO]', tone: 'emerald' };
  return null;
}

function inferLivePhase({ sessionLive, hasFinalAnswer, agents, transfers }) {
  if (!sessionLive) return 0;
  const activeKeys = Object.entries(agents || {})
    .filter(([, a]) => a && a.status && a.status !== 'idle')
    .map(([k, a]) => ({ key: k, status: a.status, tool: a.toolName || '' }));
  if (activeKeys.length === 0) return 0;

  if (hasFinalAnswer && activeKeys.every((a) => a.status === 'approved')) return 5;
  if (activeKeys.some((a) => a.key === 'guido')) return 5;
  if (activeKeys.some((a) => ['geohot', 'mitnick', 'carmack', 'rauch', 'dpo'].includes(a.key) || a.status === 'veto')) return 4;
  if (activeKeys.some((a) => ['taylor', 'steve', 'linus', 'pacioli', 'biagi', 'munari'].includes(a.key) || a.status === 'creating' || ['edit_file', 'write_file', 'run_command'].includes(a.tool))) return 3;
  if (activeKeys.some((a) => ['werner', 'karpathy', 'andrej'].includes(a.key))) return 2;
  if (activeKeys.some((a) => a.status === 'inspecting' || a.tool === 'read_file' || a.tool === 'search_web')) return 1;
  if ((transfers || []).length > 0) return 1;
  return 1;
}

function inferWorkspaceNames(subagentsList, lines) {
  const names = new Set();
  for (const sa of subagentsList || []) {
    if (!sa || typeof sa !== 'object') continue;
    for (const uri of Array.isArray(sa.workspaceUris) ? sa.workspaceUris : []) {
      if (typeof uri !== 'string' || !uri.trim()) continue;
      let clean = uri.replace(/^file:\/\//i, '');
      while (clean.endsWith('/')) clean = clean.slice(0, -1);
      const base = path.basename(clean);
      if (base) names.add(base);
    }
  }
  for (const step of lines || []) {
    if (!step || typeof step !== 'object' || !Array.isArray(step.tool_calls)) continue;
    for (const tc of step.tool_calls) {
      if (!tc || typeof tc !== 'object') continue;
      const args = parseJsonArgs(tc.args);
      if (typeof args.Path === 'string') {
        const m = args.Path.match(/\/scratch\/([^/]+)/);
        if (m && m[1]) names.add(m[1]);
      }
    }
  }
  return [...names];
}

export function isValidConvId(convId) {
  return typeof convId === 'string' && CONV_ID_RE.test(convId);
}

/**
 * Recursively collects subagent metadata up to MAX_SUBAGENT_DEPTH avoiding symlinks and cycles.
 */
function collectSubagentMetaRecursive(brainDir, convId, depth, visited, subagentsById, subagentMetaList) {
  if (!isValidConvId(convId) || depth > MAX_SUBAGENT_DEPTH || visited.has(convId)) return;
  visited.add(convId);
  if (subagentMetaList.length >= MAX_SUBAGENTS_SCAN) return;

  const saDirReal = resolveSafeSubdir(brainDir, convId, '.system_generated', 'subagents');
  if (!saDirReal) return;

  let saFiles;
  try {
    saFiles = fs.readdirSync(saDirReal);
  } catch {
    return;
  }

  for (const f of saFiles) {
    if (subagentMetaList.length >= MAX_SUBAGENTS_SCAN) break;
    if (!f.endsWith('.json')) continue;
    const info = isSafeRegularFile(brainDir, path.join(saDirReal, f), 65536);
    if (!info) continue;
    try {
      const parsed = JSON.parse(fs.readFileSync(info.real, 'utf8'));
      if (!parsed || typeof parsed !== 'object') continue;
      const desc = parsed.subagentDescriptor && typeof parsed.subagentDescriptor === 'object' ? parsed.subagentDescriptor : {};
      const canonical = normalizeAgentKey(desc.typeName, desc.role);
      const convIdRaw = String(parsed.conversationId || f.replace(/\.json$/, ''));
      const childConvId = isValidConvId(convIdRaw) ? convIdRaw : '';
      const rec = {
        conversationId: childConvId,
        parentConvId: convId,
        depth,
        typeName: String(desc.typeName || ''),
        role: sanitizeSummary(String(desc.role || ''), []),
        canonicalAgent: canonical,
        state: String(parsed.state || ''),
        spawnStepIndex: Number.isFinite(parsed.spawnStepIndex) ? parsed.spawnStepIndex : null,
        workspaceUris: Array.isArray(parsed.workspaceUris) ? parsed.workspaceUris : [],
        mtimeMs: info.stat.mtimeMs
      };
      if (childConvId) subagentsById.set(childConvId, rec);
      subagentMetaList.push(rec);
      if (childConvId) {
        collectSubagentMetaRecursive(brainDir, childConvId, depth + 1, visited, subagentsById, subagentMetaList);
      }
    } catch {
      // ignore malformed subagent JSON
    }
  }
}

function safeLstatMtimeMs(targetPath) {
  if (!targetPath) return 0;
  try {
    return fs.lstatSync(targetPath).mtimeMs || 0;
  } catch {
    return 0;
  }
}

/**
 * Reads sanitized live snapshot across recent Antigravity conversations.
 */
export function readLiveSnapshot(options = {}) {
  const nowMs = Number.isFinite(options.nowMs) ? options.nowMs : Date.now();
  const brainDir = resolveBrainDir(options.brainDir);
  const requestedConvId = options.convId;

  if (requestedConvId !== undefined && requestedConvId !== null && requestedConvId !== '') {
    if (!isValidConvId(requestedConvId)) {
      const err = new Error('Invalid conversation ID format');
      err.code = 'INVALID_CONV_ID';
      err.status = 400;
      throw err;
    }
  }

  const useCache = options.nowMs === undefined && !options.bypassCache && Boolean(brainDir);
  const cacheKey = useCache ? `${brainDir}::${requestedConvId || ''}` : '';
  if (useCache) {
    const cached = snapshotCache.get(cacheKey);
    if (cached && (nowMs - cached.cachedAtMs) <= SNAPSHOT_CACHE_TTL_MS) {
      const dirUnchanged = safeLstatMtimeMs(brainDir) === cached.dirMtimeMs;
      const txUnchanged = !cached.transcriptPath || safeLstatMtimeMs(cached.transcriptPath) === cached.transcriptMtimeMs;
      if (dirUnchanged && txUnchanged) {
        return cached.value;
      }
    }
  }

  if (!brainDir) {
    const emptyAgents = {};
    for (const k of ALL_STATION_AGENTS) {
      emptyAgents[k] = { status: 'idle', role: null, toolName: null, task: null, lastSeenAt: null, subagentState: null };
    }
    return {
      schemaVersion: 1,
      serverTime: new Date(nowMs).toISOString(),
      mode: 'live',
      activeConvId: null,
      workspaceName: null,
      sessionStatus: 'idle',
      currentPhase: 0,
      conversations: [],
      agents: emptyAgents,
      activitySummary: {
        creating: 0, working: 0, inspecting: 0, reviewing: 0, resting: ALL_STATION_AGENTS.length, approved: 0, veto: 0,
        activeCount: 0, totalCount: ALL_STATION_AGENTS.length, text: 'Tutti gli agenti a riposo'
      },
      phoenix: { active: false, trigger: null, agents: FENICE_AGENTS },
      transfers: [],
      events: [],
      snapshotDigest: 'empty'
    };
  }

  let entries = [];
  try {
    entries = fs.readdirSync(brainDir, { withFileTypes: true });
  } catch (_e) {
    // Graceful fallback when parent brain directory listing is restricted (e.g. sandbox or permission boundary)
    const candidateIds = [
      requestedConvId,
      process.env.ANTIGRAVITY_CONVERSATION_ID,
      process.env.ANTIGRAVITY_TRAJECTORY_ID
    ].filter(Boolean);
    try {
      const sessionFile = path.resolve(__dirname, '..', 'directives', 'active_session.json');
      if (fs.existsSync(sessionFile)) {
        const data = JSON.parse(fs.readFileSync(sessionFile, 'utf8'));
        if (data && isValidConvId(data.conversationId)) candidateIds.push(data.conversationId);
      }
    } catch {}
    for (const cid of candidateIds) {
      if (isValidConvId(cid)) {
        const cPath = path.join(brainDir, cid);
        try {
          if (fs.existsSync(cPath) && !entries.some(ent => ent.name === cid)) {
            entries.push({
              name: cid,
              isDirectory: () => true,
              isSymbolicLink: () => false
            });
          }
        } catch {}
      }
    }
    if (entries.length === 0) {
      const err = new Error('Unable to read Antigravity brain directory');
      err.code = 'BRAIN_UNREADABLE';
      err.status = 503;
      throw err;
    }
  }

  // Ensure active conversation ID from environment or directives is present in candidates if it exists in brainDir
  const envCandidate = process.env.ANTIGRAVITY_CONVERSATION_ID;
  let activeEnvId = null;
  if (envCandidate && isValidConvId(envCandidate)) {
    try {
      if (fs.existsSync(path.join(brainDir, envCandidate))) {
        activeEnvId = envCandidate;
        if (!entries.some(e => e.name === envCandidate)) {
          entries.unshift({
            name: envCandidate,
            isDirectory: () => true,
            isSymbolicLink: () => false
          });
        }
      }
    } catch {}
  }

  // Pre-sort valid conversation folders by directory/transcript mtime so we bound synchronous JSON scans
  const rawConvEntries = [];
  for (const ent of entries) {
    if (!ent.isDirectory() || ent.isSymbolicLink() || !isValidConvId(ent.name)) continue;
    const convLogsReal = resolveSafeSubdir(brainDir, ent.name, '.system_generated', 'logs');
    if (!convLogsReal) continue;
    const transcriptPath = path.join(convLogsReal, 'transcript.jsonl');
    const trInfo = isSafeRegularFile(brainDir, transcriptPath, 512 * 1024 * 1024);
    if (!trInfo) continue;
    rawConvEntries.push({
      id: ent.name,
      convPath: path.join(brainDir, ent.name),
      transcriptPath: trInfo.real,
      rawTranscriptMtimeMs: trInfo.stat.mtimeMs
    });
  }

  rawConvEntries.sort((a, b) => b.rawTranscriptMtimeMs - a.rawTranscriptMtimeMs);
  const scanTargetConvs = requestedConvId
    ? [...rawConvEntries.slice(0, MAX_CONVERSATIONS_SCAN), ...rawConvEntries.filter((c) => c.id === requestedConvId)].filter(
        (c, idx, arr) => arr.findIndex((x) => x.id === c.id) === idx
      )
    : rawConvEntries.slice(0, MAX_CONVERSATIONS_SCAN);

  const convCandidates = [];
  const knownChildConvIds = new Set();
  for (const item of scanTargetConvs) {
    let effectiveMtimeMs = item.rawTranscriptMtimeMs;
    const saDirReal = resolveSafeSubdir(brainDir, item.id, '.system_generated', 'subagents');
    if (saDirReal) {
      try {
        for (const saFile of fs.readdirSync(saDirReal)) {
          if (!saFile.endsWith('.json')) continue;
          const saInfo = isSafeRegularFile(brainDir, path.join(saDirReal, saFile), MAX_JSON_FILE_BYTES);
          if (!saInfo) continue;
          if (saInfo.stat.mtimeMs > effectiveMtimeMs) effectiveMtimeMs = saInfo.stat.mtimeMs;
          let childId = saFile.replace(/\.json$/, '');
          try {
            const rawMeta = JSON.parse(fs.readFileSync(saInfo.real, 'utf8'));
            if (rawMeta && typeof rawMeta === 'object' && typeof rawMeta.conversationId === 'string') {
              childId = rawMeta.conversationId;
            }
          } catch {
            // fallback to filename stem
          }
          if (isValidConvId(childId)) {
            knownChildConvIds.add(childId);
            const childLogsReal = resolveSafeSubdir(brainDir, childId, '.system_generated', 'logs');
            if (childLogsReal) {
              const childInfo = isSafeRegularFile(brainDir, path.join(childLogsReal, 'transcript.jsonl'), 512 * 1024 * 1024);
              if (childInfo && childInfo.stat.mtimeMs > effectiveMtimeMs) {
                effectiveMtimeMs = childInfo.stat.mtimeMs;
              }
            }
          }
        }
      } catch {
        // no subagents directory readable
      }
    }

    convCandidates.push({
      id: item.id,
      convPath: item.convPath,
      transcriptPath: item.transcriptPath,
      mtimeMs: effectiveMtimeMs,
      rawTranscriptMtimeMs: item.rawTranscriptMtimeMs
    });
  }

  const rootCandidates = convCandidates.filter((c) => !knownChildConvIds.has(c.id));
  const rankedCandidates = (rootCandidates.length > 0 ? rootCandidates : convCandidates)
    .slice()
    .sort((a, b) => {
      if (activeEnvId) {
        if (a.id === activeEnvId && b.id !== activeEnvId) return -1;
        if (b.id === activeEnvId && a.id !== activeEnvId) return 1;
      }
      return b.mtimeMs - a.mtimeMs;
    });
  const topConversations = rankedCandidates.slice(0, 8);

  const selected = requestedConvId
    ? convCandidates.find((c) => c.id === requestedConvId) || null
    : topConversations[0] || null;

  const agents = {};
  for (const id of ALL_STATION_AGENTS) {
    agents[id] = {
      status: 'idle',
      role: null,
      toolName: null,
      task: 'In standby',
      lastSeenAt: null,
      subagentState: null
    };
  }

  const convList = topConversations.map((c) => ({
    id: c.id,
    updatedAt: normalizeStepTimestamp(c.mtimeMs, nowMs, nowMs).iso,
    workspace: 'antigravity-workspace'
  }));

  if (!selected) {
    const emptySnap = {
      schemaVersion: 1,
      serverTime: new Date(nowMs).toISOString(),
      mode: 'live',
      activeConvId: null,
      workspaceName: 'antigravity-ecosystem',
      sessionStatus: 'idle',
      currentPhase: 0,
      conversations: convList,
      agents,
      activitySummary: {
        creating: 0, working: 0, inspecting: 0, reviewing: 0, resting: ALL_STATION_AGENTS.length, approved: 0, veto: 0,
        activeCount: 0, totalCount: ALL_STATION_AGENTS.length, text: 'Tutti gli agenti a riposo'
      },
      phoenix: {
        active: false,
        trigger: null,
        agents: FENICE_AGENTS
      },
      transfers: [],
      events: [],
      snapshotDigest: 'idle'
    };
    if (useCache) snapshotCache.set(cacheKey, { cachedAtMs: nowMs, value: emptySnap });
    return emptySnap;
  }

  const { lines, mtimeMs: transcriptMtime } = readTailLines(brainDir, selected.transcriptPath);

  // Recursively collect subagents metadata (protecting against symlinked subdirs & cycles)
  const subagentsById = new Map();
  const subagentMetaList = [];
  collectSubagentMetaRecursive(brainDir, selected.id, 1, new Set(), subagentsById, subagentMetaList);

  subagentMetaList.sort((a, b) => a.mtimeMs - b.mtimeMs);

  const workspaceNames = inferWorkspaceNames(subagentMetaList, lines);
  const primaryWorkspace = sanitizeSummary(workspaceNames[0] || 'antigravity-ecosystem', []) || 'antigravity-ecosystem';
  const selectedConvEntry = convList.find(c => c.id === selected.id);
  if (selectedConvEntry) {
    selectedConvEntry.workspace = primaryWorkspace;
  }

  // Also check recent child subagent transcripts if readable under brainDir
  const events = [];
  const transfers = [];
  let feniceActive = false;
  let feniceTrigger = null;

  if (detectFeniceSignal('', primaryWorkspace)) {
    feniceActive = true;
    feniceTrigger = `workspace:${primaryWorkspace}`;
  }

  // Evaluate main coordinator ("turing") activity from latest transcript steps
  const recentLines = lines.slice(-120);
  let lastCoordStep = null;
  let lastCoordStepMs = transcriptMtime;
  let lastCoordAction = { status: 'idle', label: 'In attesa comandi' };
  let lastCoordToolName = null;
  let coordExpectedTools = 0;
  let coordGenericsSeen = 0;
  let lastPlannerWasFinalText = false;
  let coordHasError = false;
  const childDispatchInfo = new Map();
  const childReplyInfo = new Map();
  const activeAgentCandidate = new Map();
  let seqCounter = 0;

  function recordAgentCandidate(agentKey, priority, status, role, toolName, task, lastSeenAt, subagentState, isRunning = false) {
    if (!agentKey || !agents[agentKey]) return;
    const prev = activeAgentCandidate.get(agentKey);
    if (!prev || priority > prev.priority || (priority === prev.priority && (isRunning || !prev.isRunning))) {
      activeAgentCandidate.set(agentKey, {
        priority,
        isRunning,
        status,
        role: role || agents[agentKey].role,
        toolName: toolName ?? null,
        task: task || agents[agentKey].task,
        lastSeenAt: lastSeenAt || agents[agentKey].lastSeenAt,
        subagentState: subagentState ?? agents[agentKey].subagentState
      });
    }
  }

  for (const step of recentLines) {
    if (!step || typeof step !== 'object') continue;
    const stepIdx = Number.isFinite(step.step_index) ? step.step_index : 0;
    const normTs = normalizeStepTimestamp(step.created_at, transcriptMtime, nowMs);
    const tsIso = normTs.iso;
    const stepMs = normTs.ms;
    const ageMs = nowMs - stepMs;
    const isRecent = ageMs >= 0 && ageMs <= ACTIVE_WINDOW_MS;

    if (step.status === 'ERROR') {
      coordHasError = true;
    }

    if (step.type === 'USER_INPUT' && typeof step.content === 'string') {
      coordHasError = false;
      lastCoordStep = step;
      lastCoordStepMs = stepMs;
      lastCoordToolName = null;
      coordExpectedTools = 0;
      coordGenericsSeen = 0;
      lastPlannerWasFinalText = false;
      lastCoordAction = isRecent
        ? { status: 'working', label: 'Analisi richiesta utente' }
        : { status: 'idle', label: 'In attesa comandi' };

      if (isRecent && detectFeniceSignal(step.content, primaryWorkspace)) {
        feniceActive = true;
        feniceTrigger = feniceTrigger || 'user_request_fenice';
      }
      events.push({
        id: `${selected.id}:step:${stepIdx}:user`,
        timestamp: tsIso,
        _sortMs: stepMs,
        _seq: seqCounter++,
        actor: 'Utente',
        target: 'turing',
        eventType: 'user_prompt',
        toolName: null,
        summary: 'Nuova richiesta operativa inviata a @turing',
        tone: 'indigo'
      });
      continue;
    }

    if (step.type === 'GENERIC') {
      if (coordExpectedTools > 0) {
        coordGenericsSeen += 1;
      }
      if (step.created_at) {
        lastCoordStepMs = Math.max(lastCoordStepMs, stepMs);
      }
      continue;
    }

    if (step.type === 'PLANNER_RESPONSE') {
      coordHasError = step.status === 'ERROR';
      lastCoordStep = step;
      lastCoordStepMs = stepMs;
      const tcs = Array.isArray(step.tool_calls) ? step.tool_calls : [];
      coordExpectedTools = tcs.length;
      coordGenericsSeen = 0;

      // Real-time Agent Thinking stream
      if (typeof step.thinking === 'string' && step.thinking.trim()) {
        const thinkingSummary = sanitizeSummary(step.thinking, workspaceNames);
        if (thinkingSummary) {
          events.push({
            id: `${selected.id}:step:${stepIdx}:think`,
            timestamp: tsIso,
            _sortMs: stepMs - 1,
            _seq: seqCounter++,
            actor: 'turing',
            target: 'turing',
            eventType: 'thinking',
            toolName: null,
            summary: thinkingSummary,
            tone: 'purple'
          });
        }
      }

      if (tcs.length === 0) {
        lastCoordToolName = null;
        if (step.status && step.status !== 'DONE') {
          lastPlannerWasFinalText = false;
          lastCoordAction = { status: 'working', label: 'Elabora risposta...' };
        } else {
          lastPlannerWasFinalText = true;
          lastCoordAction = { status: 'approved', label: 'Risposta inviata · pronto' };
          events.push({
            id: `${selected.id}:step:${stepIdx}:resp`,
            timestamp: tsIso,
            _sortMs: stepMs,
            _seq: seqCounter++,
            actor: 'turing',
            target: 'Utente',
            eventType: 'agent_reply',
            toolName: null,
            summary: 'Risposta elaborata e inviata all\'utente',
            tone: 'emerald'
          });
        }
        continue;
      }

      lastPlannerWasFinalText = false;
      tcs.forEach((tc, tcIdx) => {
        if (!tc || typeof tc !== 'object') return;
        const toolName = String(tc.name || '');
        const parsedArgs = parseJsonArgs(tc.args);
        const actionDesc = describeToolAction(toolName, parsedArgs, workspaceNames);
        lastCoordAction = actionDesc;
        lastCoordToolName = toolName || null;

        if (isRecent && detectFeniceSignal(`${parsedArgs.Path || ''} ${parsedArgs.Role || ''} ${parsedArgs.TypeName || ''}`, '')) {
          feniceActive = true;
          feniceTrigger = feniceTrigger || `tool:${toolName}`;
        }

        if (toolName === 'invoke_subagent') {
          const targetAgent = normalizeAgentKey(parsedArgs.TypeName, parsedArgs.Role) || 'turing';
          const roleLabel = sanitizeSummary(String(parsedArgs.Role || parsedArgs.TypeName || ''), workspaceNames);
          if (FENICE_AGENTS.includes(targetAgent) && (nowMs - stepMs) <= FENICE_WINDOW_MS) {
            feniceActive = true;
            feniceTrigger = feniceTrigger || `agent:${targetAgent}`;
          }
          if (agents[targetAgent]) {
            agents[targetAgent].role = roleLabel || agents[targetAgent].role;
            agents[targetAgent].lastSeenAt = tsIso;
          }
          // Match spawnStepIndex first, falling back to oldest unassigned matching subagent
          const exactSpawn = subagentMetaList.filter(
            (sa) => sa.canonicalAgent === targetAgent && !childDispatchInfo.has(sa.conversationId) &&
              sa.spawnStepIndex !== null && Math.abs(sa.spawnStepIndex - stepIdx) <= 1
          );
          const candidates = exactSpawn.length > 0
            ? exactSpawn
            : subagentMetaList.filter((sa) => sa.canonicalAgent === targetAgent && !childDispatchInfo.has(sa.conversationId)).slice(0, 1);
          for (const sa of candidates) {
            childDispatchInfo.set(sa.conversationId, {
              tsMs: stepMs,
              transferId: `${selected.id}:step:${stepIdx}:tc:${tcIdx}`,
              label: roleLabel ? roleLabel.slice(0, 20) : 'Delega',
              tone: '#818cf8'
            });
          }
          events.push({
            id: `${selected.id}:step:${stepIdx}:tc:${tcIdx}`,
            timestamp: tsIso,
            _sortMs: stepMs,
            _seq: seqCounter++,
            actor: 'turing',
            target: targetAgent,
            eventType: 'invoke_subagent',
            toolName,
            summary: roleLabel ? `Delega a @${targetAgent}: ${roleLabel}` : `Avvia @${targetAgent}`,
            tone: 'sky'
          });
        } else if (toolName === 'swarm') {
          const targetAgent = normalizeAgentKey(parsedArgs.name, parsedArgs.brief) || 'turing';
          const act = String(parsedArgs.action || 'status');
          if (act === 'add' && agents[targetAgent]) {
            agents[targetAgent].lastSeenAt = tsIso;
            if (isRecent) {
              recordAgentCandidate(
                targetAgent,
                2,
                'working',
                agents[targetAgent].role,
                'swarm',
                sanitizeSummary(String(parsedArgs.brief || 'Worker Swarm attivo'), workspaceNames),
                tsIso,
                null,
                true
              );
              if (targetAgent !== 'turing') {
                transfers.push({
                  id: `${selected.id}:step:${stepIdx}:tc:${tcIdx}`,
                  from: 'turing',
                  to: targetAgent,
                  label: 'Swarm Add',
                  tone: '#818cf8',
                  active: true
                });
              }
            }
          }
          events.push({
            id: `${selected.id}:step:${stepIdx}:tc:${tcIdx}`,
            timestamp: tsIso,
            _sortMs: stepMs,
            _seq: seqCounter++,
            actor: 'turing',
            target: targetAgent,
            eventType: 'swarm',
            toolName,
            summary: actionDesc.label,
            tone: 'indigo'
          });
        } else if (toolName === 'send_message') {
          const recipientId = String(parsedArgs.Recipient || '');
          const sa = subagentsById.get(recipientId);
          const targetAgent = sa?.canonicalAgent || 'turing';
          if (sa?.conversationId) {
            childDispatchInfo.set(sa.conversationId, {
              tsMs: stepMs,
              transferId: `${selected.id}:step:${stepIdx}:tc:${tcIdx}`,
              label: 'Messaggio',
              tone: '#a78bfa'
            });
          }
          if (agents[targetAgent]) {
            agents[targetAgent].lastSeenAt = tsIso;
          }
          events.push({
            id: `${selected.id}:step:${stepIdx}:tc:${tcIdx}`,
            timestamp: tsIso,
            _sortMs: stepMs,
            _seq: seqCounter++,
            actor: 'turing',
            target: targetAgent,
            eventType: 'send_message',
            toolName,
            summary: `@turing invia feedback a @${targetAgent}`,
            tone: 'violet'
          });
        } else {
          const specialist = inferSpecialistFromTool(toolName, parsedArgs);
          if (specialist && specialist !== 'turing' && agents[specialist]) {
            if (isRecent) {
              recordAgentCandidate(
                specialist,
                1,
                actionDesc.status,
                agents[specialist].role,
                toolName,
                actionDesc.label,
                tsIso,
                null,
                true
              );
              transfers.push({
                id: `${selected.id}:step:${stepIdx}:tc:${tcIdx}:spec`,
                from: 'turing',
                to: specialist,
                label: actionDesc.status === 'creating' ? 'Crea asset' : actionDesc.status === 'inspecting' ? 'Ispezione' : 'Esecuzione',
                tone: actionDesc.status === 'creating' ? '#d946ef' : actionDesc.status === 'inspecting' ? '#38bdf8' : '#10B981',
                active: true
              });
            }
            events.push({
              id: `${selected.id}:step:${stepIdx}:tc:${tcIdx}`,
              timestamp: tsIso,
              _sortMs: stepMs,
              _seq: seqCounter++,
              actor: specialist,
              target: 'turing',
              eventType: 'tool_call',
              toolName,
              summary: `@${specialist}: ${actionDesc.label}`,
              tone: actionDesc.status === 'creating' ? 'purple' : actionDesc.status === 'inspecting' ? 'sky' : 'amber'
            });
          } else {
            events.push({
              id: `${selected.id}:step:${stepIdx}:tc:${tcIdx}`,
              timestamp: tsIso,
              _sortMs: stepMs,
              _seq: seqCounter++,
              actor: 'turing',
              target: 'turing',
              eventType: 'tool_call',
              toolName,
              summary: actionDesc.label,
              tone: actionDesc.status === 'inspecting' ? 'sky' : 'amber'
            });
          }
        }
      });
    } else if (step.type === 'SYSTEM_MESSAGE' && typeof step.content === 'string') {
      const senderMatch = step.content.match(/sender=([a-zA-Z0-9_-]+)/);
      const senderId = senderMatch ? senderMatch[1] : '';
      const sa = subagentsById.get(senderId);
      if (sa && sa.canonicalAgent && agents[sa.canonicalAgent]) {
        const verdict = inferVerdictTone(step.content);
        const replyId = `${selected.id}:step:${stepIdx}:sysmsg`;
        childReplyInfo.set(sa.conversationId, {
          tsMs: stepMs,
          tsIso,
          verdict,
          replyId
        });

        const ag = agents[sa.canonicalAgent];
        ag.lastSeenAt = tsIso;
        ag.role = sa.role || ag.role;

        if ((nowMs - stepMs) <= REPLY_TRANSFER_WINDOW_MS) {
          transfers.push({
            id: replyId,
            from: sa.canonicalAgent,
            to: 'turing',
            label: verdict ? verdict.tag : 'Risposta',
            tone: verdict && verdict.tone === 'rose' ? '#f43f5e' : '#34d399',
            active: false
          });
        }
        events.push({
          id: replyId,
          timestamp: tsIso,
          _sortMs: stepMs,
          _seq: seqCounter++,
          actor: sa.canonicalAgent,
          target: 'turing',
          eventType: 'agent_reply',
          toolName: 'send_message',
          summary: verdict ? `@${sa.canonicalAgent} ➔ @turing: ${verdict.tag}` : `@${sa.canonicalAgent} risponde a @turing`,
          tone: verdict ? verdict.tone : 'emerald'
        });
      }
    }
  }

  let maxSubagentMtime = 0;
  const runningSubagents = [];

  // Process oldest-to-newest so latest instance wins deterministically per canonical agent
  const orderedSubagents = subagentMetaList.slice().sort((a, b) => a.mtimeMs - b.mtimeMs);

  // Enrich from subagent metadata + readable subagent transcripts (preserving ALL recent steps!)
  for (const sa of orderedSubagents) {
    const safeSaMtime = Math.min(sa.mtimeMs || nowMs, nowMs);
    if (safeSaMtime > maxSubagentMtime) maxSubagentMtime = safeSaMtime;
    const k = sa.canonicalAgent;
    if (!k || !agents[k]) continue;
    const saAgeMs = nowMs - safeSaMtime;
    if (FENICE_AGENTS.includes(k) && saAgeMs >= 0 && saAgeMs <= FENICE_WINDOW_MS) {
      feniceActive = true;
      feniceTrigger = feniceTrigger || `subagent:${k}`;
    }

    const reply = childReplyInfo.get(sa.conversationId) || null;
    const dispatch = childDispatchInfo.get(sa.conversationId) || null;
    const dispatchMs = dispatch ? dispatch.tsMs : 0;

    // Inspect child transcript if accessible safely without intermediate symlinks
    const childLogsReal = isValidConvId(sa.conversationId)
      ? resolveSafeSubdir(brainDir, sa.conversationId, '.system_generated', 'logs')
      : null;
    const childTail = childLogsReal
      ? readTailLines(brainDir, path.join(childLogsReal, 'transcript.jsonl'), MAX_SUBAGENT_TAIL_BYTES)
      : { lines: [], mtimeMs: 0 };
    const safeChildTailMtime = Math.min(childTail.mtimeMs || 0, nowMs);
    if (safeChildTailMtime > maxSubagentMtime) maxSubagentMtime = safeChildTailMtime;

    if (childTail.lines.length > 0) {
      const childSteps = childTail.lines.slice(-40);
      let lastToolDesc = null;
      let lastToolName = null;
      let latestChildVerdict = null;
      let latestChildStepMs = 0;
      let latestChildIso = normalizeStepTimestamp(safeChildTailMtime, nowMs, nowMs).iso;
      let hasChildError = false;
      let isChildGenerating = false;
      let childExpectedTools = 0;
      let childGenericsSeen = 0;
      let lastChildPlannerFinal = false;

      for (const cstep of childSteps) {
        if (!cstep || typeof cstep !== 'object') continue;
        const cIdx = Number.isFinite(cstep.step_index) ? cstep.step_index : 0;
        const cNorm = normalizeStepTimestamp(cstep.created_at, safeChildTailMtime || nowMs, nowMs);
        const cIso = cNorm.iso;
        const cMs = cNorm.ms;
        if (cMs >= latestChildStepMs) {
          latestChildStepMs = cMs;
          latestChildIso = cIso;
        }

        if (cstep.status === 'ERROR') {
          hasChildError = true;
          events.push({
            id: `${sa.conversationId}:step:${cIdx}:err`,
            timestamp: cIso,
            _sortMs: cMs,
            _seq: seqCounter++,
            actor: k,
            target: k,
            eventType: 'subagent_error',
            toolName: null,
            summary: 'Errore durante elaborazione step',
            tone: 'rose'
          });
          continue;
        }
        hasChildError = false;

        if (cstep.type === 'GENERIC') {
          if (childExpectedTools > 0) childGenericsSeen += 1;
          continue;
        }

        if (cstep.type === 'PLANNER_RESPONSE') {
          isChildGenerating = Boolean(cstep.status && cstep.status !== 'DONE');
          const cTcs = Array.isArray(cstep.tool_calls) ? cstep.tool_calls : [];
          childExpectedTools = cTcs.length;
          childGenericsSeen = 0;
          lastChildPlannerFinal = cTcs.length === 0 && !isChildGenerating;

          if (typeof cstep.thinking === 'string' && cstep.thinking.trim()) {
            const thinkingSummary = sanitizeSummary(cstep.thinking, workspaceNames);
            if (thinkingSummary) {
              events.push({
                id: `${sa.conversationId}:step:${cIdx}:think`,
                timestamp: cIso,
                _sortMs: cMs - 1,
                _seq: seqCounter++,
                actor: k,
                target: k,
                eventType: 'thinking',
                toolName: null,
                summary: thinkingSummary,
                tone: 'purple'
              });
            }
          }

          if (cTcs.length > 0) {
            cTcs.forEach((tc, tcIdx) => {
              if (!tc || typeof tc !== 'object') return;
              const tName = String(tc.name || '');
              const tArgs = parseJsonArgs(tc.args);
              const desc = describeToolAction(tName, tArgs, workspaceNames);
              lastToolDesc = desc;
              lastToolName = tName || null;

              events.push({
                id: `${sa.conversationId}:step:${cIdx}:tc:${tcIdx}`,
                timestamp: cIso,
                _sortMs: cMs,
                _seq: seqCounter++,
                actor: k,
                target: tName === 'send_message' ? 'turing' : k,
                eventType: 'subagent_tool',
                toolName: tName,
                summary: desc.label,
                tone: desc.status === 'inspecting' ? 'sky' : (k === 'mitnick' || k === 'geohot' ? 'rose' : 'amber')
              });
            });
          }
          const verdict = inferVerdictTone(cstep.content);
          if (verdict) {
            latestChildVerdict = verdict;
            events.push({
              id: `${sa.conversationId}:step:${cIdx}:verdict`,
              timestamp: cIso,
              _sortMs: cMs,
              _seq: seqCounter++,
              actor: k,
              target: 'turing',
              eventType: 'verdict',
              toolName: null,
              summary: `Verdetto ${verdict.tag}`,
              tone: verdict.tone
            });
          }
        }
      }

      if (!latestChildStepMs) latestChildStepMs = safeChildTailMtime;
      const childHasPendingTools = childExpectedTools > 0 && childGenericsSeen < childExpectedTools;
      const latestRelevantMs = Math.max(latestChildStepMs, dispatchMs, safeSaMtime);
      const isChildRecent = (nowMs - latestRelevantMs) <= ACTIVE_WINDOW_MS;
      const isAliveAndRunning = sa.state === 'SUBAGENT_STATE_ALIVE' && (nowMs - latestRelevantMs) <= SUBAGENT_ALIVE_WINDOW_MS;
      const replyCoversLatest = Boolean(reply && reply.tsMs >= (latestChildStepMs - 500) && dispatchMs <= reply.tsMs);

      if (hasChildError && (nowMs - latestChildStepMs) <= FINAL_ACK_WINDOW_MS) {
        recordAgentCandidate(k, 4, 'veto', sa.role, null, 'Errore durante elaborazione', latestChildIso, sa.state, false);
      } else if (replyCoversLatest) {
        // Subagent has already reported back to coordinator: only hold approval/veto briefly, then return to standby
        if ((nowMs - reply.tsMs) <= FINAL_ACK_WINDOW_MS) {
          const st = reply.verdict?.status || latestChildVerdict?.status || 'approved';
          const lbl = reply.verdict
            ? `Verdetto ${reply.verdict.tag}`
            : latestChildVerdict
            ? `Verdetto ${latestChildVerdict.tag}`
            : 'Ha inviato il report a @turing';
          recordAgentCandidate(k, 2, st, sa.role, 'send_message', lbl, reply.tsIso, sa.state, false);
        } else {
          recordAgentCandidate(k, 0, 'idle', sa.role, null, 'In standby', reply.tsIso, sa.state, false);
        }
      } else if (isChildGenerating || childHasPendingTools || (!lastChildPlannerFinal && (isChildRecent || isAliveAndRunning))) {
        runningSubagents.push(k);
        const st = lastToolDesc ? lastToolDesc.status : 'working';
        const lbl = lastToolDesc ? lastToolDesc.label : (sa.role ? `Attivo: ${sa.role}` : 'Elaborazione subagente');
        recordAgentCandidate(k, 3, st, sa.role, lastToolName, lbl, latestChildIso, sa.state, true);
        if (k !== 'turing' && dispatch) {
          transfers.push({
            id: dispatch.transferId,
            from: 'turing',
            to: k,
            label: dispatch.label,
            tone: dispatch.tone,
            active: true
          });
        }
      } else if (lastChildPlannerFinal && (nowMs - latestChildStepMs) <= FINAL_ACK_WINDOW_MS) {
        const st = latestChildVerdict ? latestChildVerdict.status : 'approved';
        const lbl = latestChildVerdict ? `Verdetto ${latestChildVerdict.tag}` : 'Report completato';
        recordAgentCandidate(k, 2, st, sa.role, lastToolName, lbl, latestChildIso, sa.state, false);
      } else {
        recordAgentCandidate(k, 0, 'idle', sa.role, null, 'In standby', latestChildIso, sa.state, false);
      }
    } else {
      // Child has no transcript file yet (just spawned or headless image-generator/browser subagent)
      const latestMetaMs = Math.max(safeSaMtime, dispatchMs);
      const replyCoversSpawn = Boolean(reply && reply.tsMs >= (latestMetaMs - 500) && dispatchMs <= reply.tsMs);

      if (replyCoversSpawn) {
        if ((nowMs - reply.tsMs) <= FINAL_ACK_WINDOW_MS) {
          const st = reply.verdict?.status || 'approved';
          const lbl = reply.verdict ? `Verdetto ${reply.verdict.tag}` : 'Ha inviato il report a @turing';
          recordAgentCandidate(k, 2, st, sa.role, 'send_message', lbl, reply.tsIso, sa.state, false);
        } else {
          recordAgentCandidate(k, 0, 'idle', sa.role, null, 'In standby', reply.tsIso, sa.state, false);
        }
      } else if (sa.state === 'SUBAGENT_STATE_ALIVE' && (nowMs - latestMetaMs) <= SUBAGENT_ALIVE_WINDOW_MS) {
        runningSubagents.push(k);
        const lbl = sa.role ? `Attivo: ${sa.role}` : 'Subagente attivo';
        recordAgentCandidate(k, 3, 'working', sa.role, 'invoke_subagent', lbl, new Date(latestMetaMs).toISOString(), sa.state, true);
        if (k !== 'turing') {
          transfers.push({
            id: dispatch ? dispatch.transferId : `sa:${sa.conversationId}`,
            from: 'turing',
            to: k,
            label: (sa.role || 'Delega').slice(0, 20),
            tone: dispatch ? dispatch.tone : '#818cf8',
            active: true
          });
        }
      } else {
        recordAgentCandidate(k, 0, 'idle', sa.role, null, 'In standby', new Date(safeSaMtime).toISOString(), sa.state, false);
      }
    }
  }

  for (const [k, cand] of activeAgentCandidate.entries()) {
    if (!agents[k] || k === 'turing') continue;
    agents[k].status = cand.status;
    agents[k].role = cand.role || agents[k].role;
    agents[k].toolName = cand.toolName;
    agents[k].task = cand.task;
    agents[k].lastSeenAt = cand.lastSeenAt;
    agents[k].subagentState = cand.subagentState;
  }

  // Coordinator final status synchronized accurately with step lifecycle and pending tools
  const safeTranscriptMtime = Math.min(transcriptMtime || nowMs, nowMs);
  const latestActivityMs = Math.max(safeTranscriptMtime, maxSubagentMtime, Math.min(selected.mtimeMs || 0, nowMs));
  const coordHasPendingTools = !coordHasError && coordExpectedTools > 0 && coordGenericsSeen < coordExpectedTools;
  const ageSinceCoordMs = Math.max(0, nowMs - (lastCoordStepMs || safeTranscriptMtime));
  const activeSpecialists = [...activeAgentCandidate.keys()].filter(k => {
    if (k === 'turing') return false;
    const st = agents[k]?.status;
    return st === 'working' || st === 'creating' || st === 'inspecting' || st === 'reviewing';
  });
  const uniqueRunningSubagents = [...new Set([...runningSubagents.filter((r) => r !== 'turing'), ...activeSpecialists])];

  if (lastCoordStep) {
    agents.turing.lastSeenAt = normalizeStepTimestamp(lastCoordStep.created_at, latestActivityMs, nowMs).iso;
    agents.turing.toolName = lastCoordToolName;

    if (coordHasError) {
      if (ageSinceCoordMs <= FINAL_ACK_WINDOW_MS) {
        agents.turing.status = 'veto';
        agents.turing.task = 'Errore durante esecuzione step';
      } else {
        agents.turing.status = 'idle';
        agents.turing.toolName = null;
        agents.turing.task = 'Sessione in standby';
      }
    } else if (coordHasPendingTools) {
      agents.turing.status = lastCoordAction.status === 'idle' ? 'working' : lastCoordAction.status;
      agents.turing.task = lastCoordAction.label;
    } else if (lastPlannerWasFinalText) {
      if (uniqueRunningSubagents.length > 0) {
        agents.turing.status = 'reviewing';
        agents.turing.toolName = 'invoke_subagent';
        agents.turing.task = `Attende ${uniqueRunningSubagents.length} subagenti (${uniqueRunningSubagents.slice(0, 2).map((u) => `@${u}`).join(', ')})`;
      } else if (ageSinceCoordMs <= FINAL_ACK_WINDOW_MS) {
        agents.turing.status = 'approved';
        agents.turing.toolName = null;
        agents.turing.task = 'Risposta inviata · pronto';
      } else {
        agents.turing.status = 'idle';
        agents.turing.toolName = null;
        agents.turing.task = 'In standby (attesa prompt)';
      }
    } else if (ageSinceCoordMs <= ACTIVE_WINDOW_MS) {
      if (uniqueRunningSubagents.length > 0 && lastCoordToolName === 'invoke_subagent') {
        agents.turing.status = 'reviewing';
        agents.turing.task = `Coordina ${uniqueRunningSubagents.map((u) => `@${u}`).slice(0, 3).join(', ')}`;
      } else {
        agents.turing.status = lastCoordAction.status === 'idle' ? 'working' : lastCoordAction.status;
        agents.turing.task = lastCoordAction.label;
      }
    } else if (uniqueRunningSubagents.length > 0) {
      agents.turing.status = 'reviewing';
      agents.turing.task = `Coordina ${uniqueRunningSubagents.map((u) => `@${u}`).slice(0, 3).join(', ')}`;
    } else {
      agents.turing.status = 'idle';
      agents.turing.toolName = null;
      agents.turing.task = 'Sessione in standby';
    }
  }

  const isConvLive = uniqueRunningSubagents.length > 0 ||
    Object.values(agents).some((ag) => ag && ag.status && ag.status !== 'idle');

  // Deduplicate transfers by edge (preferring latest)
  const uniqueTransfers = [];
  const seenEdges = new Set();
  for (let i = transfers.length - 1; i >= 0 && uniqueTransfers.length < 10; i -= 1) {
    const tr = transfers[i];
    const key = `${tr.from}->${tr.to}`;
    if (!seenEdges.has(key)) {
      seenEdges.add(key);
      uniqueTransfers.unshift(tr);
    }
  }

  const currentPhase = inferLivePhase({
    sessionLive: isConvLive,
    hasFinalAnswer: lastPlannerWasFinalText,
    agents,
    transfers: uniqueTransfers
  });

  // Unified chronological sort across coordinator + all active subagents
  events.sort((a, b) => {
    if (a._sortMs !== b._sortMs) return a._sortMs - b._sortMs;
    return a._seq - b._seq;
  });

  const cleanEvents = events.slice(-80).map(({ _sortMs, _seq, ...ev }) => ev);

  const computeActivitySummary = (agentsObj) => {
    const summary = {
      creating: 0,
      working: 0,
      inspecting: 0,
      reviewing: 0,
      resting: 0,
      approved: 0,
      veto: 0,
      activeCount: 0,
      totalCount: Object.keys(agentsObj || {}).length,
      text: ''
    };
    for (const ag of Object.values(agentsObj || {})) {
      const st = ag?.status || 'idle';
      if (st === 'creating') { summary.creating += 1; summary.activeCount += 1; }
      else if (st === 'working') { summary.working += 1; summary.activeCount += 1; }
      else if (st === 'inspecting') { summary.inspecting += 1; summary.activeCount += 1; }
      else if (st === 'reviewing') { summary.reviewing += 1; summary.activeCount += 1; }
      else if (st === 'veto') { summary.veto += 1; summary.activeCount += 1; }
      else if (st === 'approved') { summary.approved += 1; }
      else { summary.resting += 1; }
    }
    const parts = [];
    if (summary.creating > 0) parts.push(`${summary.creating} sta${summary.creating > 1 ? 'nno' : ''} creando`);
    if (summary.working > 0) parts.push(`${summary.working} al lavoro`);
    if (summary.inspecting > 0) parts.push(`${summary.inspecting} in ispezione`);
    if (summary.reviewing > 0) parts.push(`${summary.reviewing} in revisione`);
    if (summary.veto > 0) parts.push(`${summary.veto} veto`);
    if (summary.approved > 0) parts.push(`${summary.approved} approvato`);
    if (summary.resting > 0) parts.push(`${summary.resting} a riposo`);
    summary.text = parts.length > 0 ? parts.join(' • ') : 'Tutti gli agenti a riposo';
    return summary;
  };

  const activitySummary = computeActivitySummary(agents);

  const snapshot = {
    schemaVersion: 1,
    serverTime: new Date(nowMs).toISOString(),
    mode: 'live',
    activeConvId: selected.id,
    workspaceName: primaryWorkspace,
    sessionStatus: isConvLive ? 'active' : 'idle',
    currentPhase,
    conversations: convList,
    agents,
    activitySummary,
    phoenix: {
      active: feniceActive,
      trigger: feniceTrigger,
      agents: FENICE_AGENTS
    },
    transfers: uniqueTransfers,
    events: cleanEvents,
    snapshotDigest: crypto
      .createHash('sha1')
      .update(JSON.stringify({
        id: selected.id,
        isConvLive,
        currentPhase,
        agents,
        feniceActive,
        transfers: uniqueTransfers,
        eventCount: cleanEvents.length,
        tailEvents: cleanEvents.slice(-15).map((e) => `${e.id}:${e.summary}`)
      }))
      .digest('hex')
      .slice(0, 12)
  };
  if (useCache) {
    if (snapshotCache.size >= 16) {
      const oldestKey = snapshotCache.keys().next().value;
      if (oldestKey) snapshotCache.delete(oldestKey);
    }
    const txPath = selected && selected.transcriptPath ? selected.transcriptPath : '';
    snapshotCache.set(cacheKey, {
      cachedAtMs: nowMs,
      dirMtimeMs: safeLstatMtimeMs(brainDir),
      transcriptPath: txPath,
      transcriptMtimeMs: safeLstatMtimeMs(txPath),
      value: snapshot
    });
  }
  return snapshot;
}

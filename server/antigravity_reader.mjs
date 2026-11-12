/**
 * antigravity_reader.mjs — Read-only sanitized Antigravity brain & session reader.
 * Strictly zero child_process usage, streaming tail reads, symlink protection,
 * and strict allowlist sanitization (never leaks secrets, raw prompts, or file bodies).
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';

export const CANONICAL_AGENTS = [
  'turing', 'werner', 'taylor', 'linus', 'steve',
  'carmack', 'rauch', 'geohot', 'guido'
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
  'linus': 'linus',
  'devops-infra-sage': 'linus',
  'devops': 'linus',
  'steve': 'steve',
  'ui-ux-designer': 'steve',
  'designer': 'steve',
  'carmack': 'carmack',
  'qa-engineer': 'carmack',
  'qa': 'carmack',
  'rauch': 'rauch',
  'integration-tester': 'rauch',
  'integration': 'rauch',
  'geohot': 'geohot',
  'security-auditor': 'geohot',
  'security': 'geohot',
  'guido': 'guido',
  'documentation-engineer': 'guido',
  'docs': 'guido',
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
const MAX_TAIL_BYTES = 256 * 1024;
const MAX_JSON_FILE_BYTES = 128 * 1024;
const ACTIVE_WINDOW_MS = 3 * 60 * 1000;
const FENICE_WINDOW_MS = 15 * 60 * 1000;

/**
 * Redacts potential secrets, tokens, credentials, and host-specific absolute paths.
 */
export function sanitizeSummary(raw, workspaceNames = []) {
  if (!raw || typeof raw !== 'string') return '';
  let text = raw
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

    const size = lstat.size;
    if (size === 0) return { lines: [], mtimeMs: lstat.mtimeMs };
    const start = Math.max(0, size - maxBytes);
    const length = size - start;
    const buf = Buffer.allocUnsafe(length);
    const fd = fs.openSync(real, 'r');
    try {
      fs.readSync(fd, buf, 0, length, start);
    } finally {
      fs.closeSync(fd);
    }
    let rawLines = buf.toString('utf8').split(/\r?\n/);
    if (start > 0 && rawLines.length > 0) {
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
    return { lines: parsed, mtimeMs: lstat.mtimeMs };
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
  if (!rawArgs || typeof rawArgs !== 'object') return {};
  const out = {};
  for (const [k, v] of Object.entries(rawArgs)) {
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
    return { status: 'working', label: target ? `Modifica ${target}` : 'Modifica codice' };
  }
  if (name === 'run_command') {
    const summary = parsedArgs.toolSummary ? sanitizeSummary(String(parsedArgs.toolSummary), workspaceNames) : 'Esegue comando verifica';
    return { status: 'working', label: summary };
  }
  if (name === 'invoke_subagent') {
    const targetType = parsedArgs.TypeName || parsedArgs.Role || 'subagent';
    return { status: 'working', label: `Delega a ${sanitizeSummary(String(targetType), workspaceNames)}` };
  }
  if (name === 'send_message') {
    return { status: 'reviewing', label: 'Coordina team via messaggio' };
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

function inferWorkspaceNames(subagentsList, lines) {
  const names = new Set();
  for (const sa of subagentsList || []) {
    if (!sa || typeof sa !== 'object') continue;
    for (const uri of Array.isArray(sa.workspaceUris) ? sa.workspaceUris : []) {
      const clean = String(uri).replace(/^file:\/\//i, '').replace(/\/+$/, '');
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
 * Reads sanitized live snapshot across recent Antigravity conversations.
 */
export function readLiveSnapshot(options = {}) {
  const nowMs = typeof options.nowMs === 'number' ? options.nowMs : Date.now();
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
      conversations: [],
      agents: emptyAgents,
      phoenix: { active: false, trigger: null, agents: FENICE_AGENTS },
      transfers: [],
      events: [],
      snapshotDigest: 'empty'
    };
  }

  let entries = [];
  try {
    entries = fs.readdirSync(brainDir, { withFileTypes: true });
  } catch (e) {
    const err = new Error('Unable to read Antigravity brain directory');
    err.code = 'BRAIN_UNREADABLE';
    err.status = 503;
    throw err;
  }

  const convCandidates = [];
  for (const ent of entries) {
    if (!ent.isDirectory() || ent.isSymbolicLink() || !isValidConvId(ent.name)) continue;
    const convPath = path.join(brainDir, ent.name);
    const transcriptPath = path.join(convPath, '.system_generated', 'logs', 'transcript.jsonl');
    try {
      const st = fs.lstatSync(transcriptPath);
      if (st.isSymbolicLink() || !st.isFile()) continue;
      convCandidates.push({
        id: ent.name,
        convPath,
        transcriptPath,
        mtimeMs: st.mtimeMs
      });
    } catch {
      // Conversation without transcript.jsonl yet
    }
  }

  convCandidates.sort((a, b) => b.mtimeMs - a.mtimeMs);
  const topConversations = convCandidates.slice(0, 8);

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
    updatedAt: new Date(c.mtimeMs).toISOString(),
    workspace: 'antigravity-workspace'
  }));

  if (!selected) {
    return {
      schemaVersion: 1,
      serverTime: new Date(nowMs).toISOString(),
      mode: 'live',
      activeConvId: null,
      workspaceName: 'antigravity-ecosystem',
      sessionStatus: 'idle',
      conversations: convList,
      agents,
      phoenix: {
        active: false,
        trigger: null,
        agents: FENICE_AGENTS
      },
      transfers: [],
      events: [],
      snapshotDigest: 'idle'
    };
  }

  const { lines, mtimeMs: transcriptMtime } = readTailLines(brainDir, selected.transcriptPath);

  // Inspect subagents metadata (protect against symlinked subagents directory)
  const subagentsDir = path.join(selected.convPath, '.system_generated', 'subagents');
  const subagentsById = new Map();
  const subagentMetaList = [];
  try {
    const dirStat = fs.lstatSync(subagentsDir);
    if (!dirStat.isSymbolicLink() && dirStat.isDirectory()) {
      const saFiles = fs.readdirSync(subagentsDir);
      for (const f of saFiles) {
        if (!f.endsWith('.json')) continue;
        const info = isSafeRegularFile(brainDir, path.join(subagentsDir, f), 65536);
        if (!info) continue;
        try {
          const parsed = JSON.parse(fs.readFileSync(info.real, 'utf8'));
          if (!parsed || typeof parsed !== 'object') continue;
          const desc = parsed.subagentDescriptor && typeof parsed.subagentDescriptor === 'object' ? parsed.subagentDescriptor : {};
          const canonical = normalizeAgentKey(desc.typeName, desc.role);
          const convIdRaw = String(parsed.conversationId || f.replace(/\.json$/, ''));
          const rec = {
            conversationId: isValidConvId(convIdRaw) ? convIdRaw : '',
            typeName: String(desc.typeName || ''),
            role: sanitizeSummary(String(desc.role || ''), []),
            canonicalAgent: canonical,
            state: String(parsed.state || ''),
            workspaceUris: Array.isArray(parsed.workspaceUris) ? parsed.workspaceUris : [],
            mtimeMs: info.stat.mtimeMs
          };
          if (rec.conversationId) subagentsById.set(rec.conversationId, rec);
          subagentMetaList.push(rec);
        } catch {
          // ignore malformed file
        }
      }
    }
  } catch {
    // ignore absent or unreadable subagent dir
  }

  const workspaceNames = inferWorkspaceNames(subagentMetaList, lines);
  const primaryWorkspace = workspaceNames[0] || 'antigravity-ecosystem';
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
  const recentLines = lines.slice(-60);
  let lastCoordStep = null;
  let lastCoordAction = { status: 'idle', label: 'In attesa comandi' };
  let lastCoordToolName = null;

  for (const step of recentLines) {
    if (!step || typeof step !== 'object') continue;
    const stepIdx = Number.isFinite(step.step_index) ? step.step_index : 0;
    const tsIso = typeof step.created_at === 'string' && step.created_at ? step.created_at : new Date(transcriptMtime).toISOString();
    const stepMs = Date.parse(tsIso) || transcriptMtime;
    const isRecent = (nowMs - stepMs) <= ACTIVE_WINDOW_MS;

    if (step.type === 'USER_INPUT' && typeof step.content === 'string') {
      if (isRecent && detectFeniceSignal(step.content, primaryWorkspace)) {
        feniceActive = true;
        feniceTrigger = feniceTrigger || 'user_request_fenice';
      }
      if (isRecent) {
        lastCoordStep = step;
        lastCoordToolName = null;
        lastCoordAction = { status: 'working', label: 'Analisi richiesta utente' };
      }
      events.push({
        id: `${selected.id}:step:${stepIdx}:user`,
        timestamp: tsIso,
        actor: 'Utente',
        target: 'turing',
        eventType: 'user_prompt',
        toolName: null,
        summary: 'Nuova richiesta operativa inviata a @turing',
        tone: 'indigo'
      });
      continue;
    }

    if (step.type === 'PLANNER_RESPONSE') {
      lastCoordStep = step;
      const tcs = Array.isArray(step.tool_calls) ? step.tool_calls : [];
      if (tcs.length === 0 && isRecent) {
        lastCoordToolName = null;
        lastCoordAction = { status: 'working', label: 'Elabora risposta/report finale' };
      }
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
            if (isRecent) {
              agents[targetAgent].status = 'inspecting';
              agents[targetAgent].toolName = 'invoke_subagent';
              agents[targetAgent].task = roleLabel ? `Attivato: ${roleLabel}` : 'Analisi avviata';
            }
          }
          if (isRecent && targetAgent !== 'turing') {
            transfers.push({
              from: 'turing',
              to: targetAgent,
              label: roleLabel ? roleLabel.slice(0, 20) : 'Delega',
              tone: '#818cf8'
            });
          }
          events.push({
            id: `${selected.id}:step:${stepIdx}:tc:${tcIdx}`,
            timestamp: tsIso,
            actor: 'turing',
            target: targetAgent,
            eventType: 'invoke_subagent',
            toolName,
            summary: roleLabel ? `Delega a @${targetAgent}: ${roleLabel}` : `Avvia @${targetAgent}`,
            tone: 'sky'
          });
        } else if (toolName === 'send_message') {
          const recipientId = String(parsedArgs.Recipient || '');
          const sa = subagentsById.get(recipientId);
          const targetAgent = sa?.canonicalAgent || 'turing';
          if (agents[targetAgent]) {
            agents[targetAgent].lastSeenAt = tsIso;
            if (isRecent) {
              agents[targetAgent].status = 'reviewing';
              agents[targetAgent].toolName = 'send_message';
              agents[targetAgent].task = 'Riceve istruzioni da @turing';
            }
          }
          if (isRecent && targetAgent !== 'turing') {
            transfers.push({
              from: 'turing',
              to: targetAgent,
              label: 'Messaggio',
              tone: '#a78bfa'
            });
          }
          events.push({
            id: `${selected.id}:step:${stepIdx}:tc:${tcIdx}`,
            timestamp: tsIso,
            actor: 'turing',
            target: targetAgent,
            eventType: 'send_message',
            toolName,
            summary: `@turing invia feedback a @${targetAgent}`,
            tone: 'violet'
          });
        } else {
          events.push({
            id: `${selected.id}:step:${stepIdx}:tc:${tcIdx}`,
            timestamp: tsIso,
            actor: 'turing',
            target: 'turing',
            eventType: 'tool_call',
            toolName,
            summary: actionDesc.label,
            tone: actionDesc.status === 'inspecting' ? 'sky' : 'amber'
          });
        }
      });
    } else if (step.type === 'SYSTEM_MESSAGE' && typeof step.content === 'string') {
      const senderMatch = step.content.match(/sender=([a-zA-Z0-9_-]+)/);
      const senderId = senderMatch ? senderMatch[1] : '';
      const sa = subagentsById.get(senderId);
      if (sa && sa.canonicalAgent && agents[sa.canonicalAgent]) {
        const verdict = inferVerdictTone(step.content);
        const ag = agents[sa.canonicalAgent];
        ag.lastSeenAt = tsIso;
        ag.role = sa.role || ag.role;
        if (verdict) {
          ag.status = verdict.status;
          ag.task = `Verdetto ${verdict.tag} inviato`;
        } else if (isRecent) {
          ag.status = 'approved';
          ag.task = 'Ha inviato il report a @turing';
        }
        if (isRecent) {
          transfers.push({
            from: sa.canonicalAgent,
            to: 'turing',
            label: verdict ? verdict.tag : 'Risposta',
            tone: verdict && verdict.tone === 'rose' ? '#f43f5e' : '#34d399'
          });
        }
        events.push({
          id: `${selected.id}:step:${stepIdx}:sysmsg`,
          timestamp: tsIso,
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

  // Enrich from subagent metadata + readable subagent transcripts
  for (const sa of subagentMetaList) {
    const k = sa.canonicalAgent;
    if (!k || !agents[k]) continue;
    if (FENICE_AGENTS.includes(k) && (nowMs - sa.mtimeMs) <= FENICE_WINDOW_MS) {
      feniceActive = true;
      feniceTrigger = feniceTrigger || `subagent:${k}`;
    }
    agents[k].role = sa.role || agents[k].role;
    agents[k].subagentState = sa.state || null;

    // Inspect child transcript if accessible
    const childTail = isValidConvId(sa.conversationId)
      ? readTailLines(brainDir, path.join(brainDir, sa.conversationId, '.system_generated', 'logs', 'transcript.jsonl'), 64 * 1024)
      : { lines: [], mtimeMs: 0 };
    if (childTail.lines.length > 0) {
      const lastChild = childTail.lines[childTail.lines.length - 1];
      if (!lastChild || typeof lastChild !== 'object') continue;
      const childMs = Date.parse(lastChild.created_at || '') || childTail.mtimeMs;
      const isChildRecent = (nowMs - childMs) <= ACTIVE_WINDOW_MS;
      agents[k].lastSeenAt = lastChild.created_at || new Date(childTail.mtimeMs).toISOString();

      if (lastChild.status === 'ERROR') {
        agents[k].status = 'veto';
        agents[k].task = 'Errore durante elaborazione';
      } else {
        const verdict = inferVerdictTone(lastChild.content);
        if (verdict) {
          agents[k].status = verdict.status;
          agents[k].task = `Verdetto ${verdict.tag}`;
        } else if (Array.isArray(lastChild.tool_calls) && lastChild.tool_calls.length > 0 && isChildRecent) {
          const lastTc = lastChild.tool_calls[lastChild.tool_calls.length - 1];
          if (lastTc && typeof lastTc === 'object') {
            const desc = describeToolAction(lastTc.name, parseJsonArgs(lastTc.args), workspaceNames);
            agents[k].status = desc.status;
            agents[k].toolName = lastTc.name || null;
            agents[k].task = desc.label;
          }
        } else if (isChildRecent && sa.state === 'SUBAGENT_STATE_ALIVE') {
          if (agents[k].status === 'idle') {
            agents[k].status = 'working';
            agents[k].task = sa.role ? `Attivo: ${sa.role}` : 'Subagente attivo';
          }
        }
      }
    } else {
      if (!agents[k].lastSeenAt) {
        agents[k].lastSeenAt = new Date(sa.mtimeMs).toISOString();
      }
      if (sa.state === 'SUBAGENT_STATE_ALIVE' && (nowMs - sa.mtimeMs) <= ACTIVE_WINDOW_MS && agents[k].status === 'idle') {
        agents[k].status = 'working';
        agents[k].task = sa.role ? `Attivo: ${sa.role}` : 'Subagente attivo';
      }
    }
  }

  // Coordinator final status
  const isConvLive = (nowMs - transcriptMtime) <= ACTIVE_WINDOW_MS;
  if (lastCoordStep) {
    agents.turing.lastSeenAt = lastCoordStep.created_at || new Date(transcriptMtime).toISOString();
    agents.turing.toolName = lastCoordAction.label ? lastCoordToolName : null;
    if (isConvLive) {
      agents.turing.status = lastCoordAction.status === 'idle' ? 'working' : lastCoordAction.status;
      agents.turing.task = lastCoordAction.label;
    } else {
      agents.turing.status = 'idle';
      agents.turing.task = 'Sessione in pausa / attesa';
    }
  }

  // Deduplicate transfers by edge
  const uniqueTransfers = [];
  const seenEdges = new Set();
  for (const tr of transfers.slice(-6)) {
    const key = `${tr.from}->${tr.to}`;
    if (!seenEdges.has(key)) {
      seenEdges.add(key);
      uniqueTransfers.push(tr);
    }
  }

  return {
    schemaVersion: 1,
    serverTime: new Date(nowMs).toISOString(),
    mode: 'live',
    activeConvId: selected.id,
    workspaceName: primaryWorkspace,
    sessionStatus: isConvLive ? 'active' : 'idle',
    conversations: convList,
    agents,
    phoenix: {
      active: feniceActive,
      trigger: feniceTrigger,
      agents: FENICE_AGENTS
    },
    transfers: uniqueTransfers,
    events: events.slice(-40),
    snapshotDigest: crypto
      .createHash('sha1')
      .update(JSON.stringify({ id: selected.id, agents, feniceActive, lastEv: events[events.length - 1]?.id || '' }))
      .digest('hex')
      .slice(0, 12)
  };
}

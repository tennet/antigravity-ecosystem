#!/usr/bin/env node
/**
 * mission_control_studio_server.mjs — Antigravity Live Studio & Cockpit Server
 * Parallel interactive evolution of mission_control_server.mjs (v4.2.0-studio).
 *
 * Invariants & Capabilities:
 * - Read-only live Antigravity monitoring via SSE (/api/stream, /api/live)
 * - Safe Skill Management (/api/skills): inspect, edit, create and validate SKILL.md
 * - Interactive Directives Dispatcher (/api/directives): send instructions to individual agents
 * - Zero external npm dependencies (node:http, node:fs, node:crypto)
 * - Fail-closed Bearer/Cookie authentication on LAN bindings
 * - CSRF mitigation via X-Requested-With header check on all POST routes
 * - Strict regex allowlist & path-traversal prevention
 * - Non-destructive: leaves the original mission_control_server.mjs untouched.
 */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import os from 'node:os';
import child_process from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  readLiveSnapshot,
  isValidConvId,
  resolveBrainDir,
  resolveSafeSubdir,
  CANONICAL_AGENTS,
  ALL_STATION_AGENTS
} from './antigravity_reader.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DEFAULT_ROOT = path.resolve(__dirname, '..');

const MAX_SSE_GLOBAL = 25;
const MAX_SSE_PER_IP = 6;
const MAX_SSE_BUFFER_BYTES = 262_144;
const MAX_BODY_BYTES = 262_144;
const RATE_WINDOW_MS = 10_000;
const RATE_LIMIT_MAX = 180;
const AUTH_FAIL_WINDOW_MS = 60_000;
const AUTH_FAIL_MAX = 6;
const AUTH_COOKIE_TTL_MS = 12 * 60 * 60 * 1000;
const SSE_HEARTBEAT_MS = 15_000;
const LIVE_POLL_MS = 400;

const SKILL_NAME_RE = /^[a-z0-9][a-z0-9-]{1,60}$/;

const DEFAULT_SKILL_DOMAINS = {
  'creative-ui-art-direction': { domain: 'UI/UX & Art Direction', agents: ['steve'] },
  'laravel-boost-and-best-practices': { domain: 'Backend & Database', agents: ['taylor'] },
  'laravel-blade-tailwind-v4': { domain: 'Frontend Blade & Tailwind', agents: ['steve', 'taylor'] },
  'laravel-testing-standards': { domain: 'QA & Testing', agents: ['carmack', 'rauch'] },
  'laravel-cloud-ops': { domain: 'DevOps & Cloud PaaS', agents: ['linus'] },
  'ai-llm-integration-evals-and-security': { domain: 'AI / LLM & Evals', agents: ['karpathy', 'geohot'] },
  'dirty-data-etl-and-scraping': { domain: 'ETL & Scraping', agents: ['taylor', 'rauch'] },
  'proxmox-caddy-vm': { domain: 'Infra VM & Hardening', agents: ['linus'] },
  'stackcp-shared-hosting': { domain: 'Hosting Apache', agents: ['linus'] },
  'zero-trust-edge-auth': { domain: 'Edge Security', agents: ['werner', 'geohot'] },
  'standalone-interactive-html': { domain: 'UI Standalone 2.5D', agents: ['steve', 'munari'] },
  'nodejs-zero-dep-server': { domain: 'Node ESM Runtime', agents: ['werner', 'taylor'] },
  'docs-doctest-and-context-sync': { domain: 'Docs & Memory', agents: ['guido'] },
  'gdpr-evidence-compliance': { domain: 'GDPR & Legal E0-E3', agents: ['dpo'] }
};

export const AGENT_CANON_MAP = {
  turing: { prompt: 'project-orchestrator.md', canon: '09_engineering_orchestration_canon.md', title: 'Volume 09: Orchestrazione Ingegneristica, Governance RACI & Quorum' },
  werner: { prompt: 'software-architect.md', canon: '01_software_architecture_canon.md', title: 'Volume 01: Architettura di Sistema, Contratti Tipizzati & Edge Zero Trust' },
  taylor: { prompt: 'polyglot-backend-sage.md', canon: '02_database_and_backend_canon.md', title: 'Volume 02: Database & Backend Master, Laravel 11-13 & Node ESM' },
  linus: { prompt: 'devops-infra-sage.md', canon: '03_devops_and_reliability_canon.md', title: 'Volume 03: DevOps, SRE, Hardening Docker, Proxmox & StackCP' },
  mitnick: { prompt: 'ethical-hacker-redteam.md', canon: '12_red_team_and_ethical_hacking_canon.md', title: 'Volume 12: Ethical Hacking, Red Team & Vulnerability Assessment' },
  steve: { prompt: 'ui-ux-designer.md', canon: '04_ui_ux_design_canon.md', title: 'Volume 04: UI/UX Design, OKLCH, Blade + Tailwind v4 & Standalone HTML' },
  karpathy: { prompt: 'ai-systems-engineer.md', canon: '10_ai_systems_and_evals_canon.md', title: 'Volume 10: Sistemi AI, LLM Integration, Fallback & Evals Deterministiche' },
  dpo: { prompt: 'privacy-compliance-counsel.md', canon: '11_privacy_gdpr_and_evidence_canon.md', title: 'Volume 11: Privacy, GDPR art. 28/35 & Valore Probatorio eIDAS/CAD E0-E3' },
  carmack: { prompt: 'qa-engineer.md', canon: '05_qa_and_defect_prevention_canon.md', title: 'Volume 05: Quality Assurance, TDD Estremo, Boundary Testing & Crash Resilience' },
  rauch: { prompt: 'integration-tester.md', canon: '06_integration_and_resilience_canon.md', title: 'Volume 06: Integration Testing, Resilienza E2E, SSE Streaming & Circuit Breaker' },
  geohot: { prompt: 'security-auditor.md', canon: '07_adversarial_security_canon.md', title: 'Volume 07: Adversarial Security Audit, OWASP Top 10 & Diritto di Veto' },
  guido: { prompt: 'documentation-engineer.md', canon: '08_technical_documentation_canon.md', title: 'Volume 08: Technical Documentation, Docs-as-Code & Diátaxis Framework' }
};

function isLoopbackHost(host) {
  const h = String(host || '').trim().toLowerCase();
  return h === '127.0.0.1' || h === '::1' || h === 'localhost';
}

function isAllowedLoopbackHostHeader(hostHeader) {
  if (!hostHeader || typeof hostHeader !== 'string') return true;
  const raw = hostHeader.trim().toLowerCase();
  if (!raw) return true;
  if (raw.startsWith('[')) {
    const end = raw.indexOf(']');
    if (end === -1) return false;
    const inside = raw.slice(1, end);
    return inside === '::1';
  }
  const colonIdx = raw.indexOf(':');
  const hostname = colonIdx === -1 ? raw : raw.slice(0, colonIdx);
  return hostname === '127.0.0.1' || hostname === 'localhost';
}

function constantTimeEquals(a, b) {
  const bufA = Buffer.from(String(a || ''), 'utf8');
  const bufB = Buffer.from(String(b || ''), 'utf8');
  if (bufA.length === 0 || bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

function parseCookies(cookieHeader) {
  const out = Object.create(null);
  if (!cookieHeader || typeof cookieHeader !== 'string') return out;
  for (const part of cookieHeader.split(';')) {
    const eq = part.indexOf('=');
    if (eq <= 0) continue;
    const k = part.slice(0, eq).trim();
    const v = part.slice(eq + 1).trim();
    if (k && Object.prototype.hasOwnProperty.call(out, k) === false) {
      out[k] = v;
    }
  }
  return out;
}

function extractHtmlCsp(htmlContent) {
  const m = htmlContent.match(/<meta\s+http-equiv="Content-Security-Policy"\s+content="([^"]+)"/i);
  const base = m
    ? m[1]
    : "default-src 'none'; style-src 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src 'self'; base-uri 'none'; form-action 'none';";
  return base.includes('frame-ancestors') ? base : `${base.replace(/;?\s*$/, ';')} frame-ancestors 'none';`;
}

function sendProblem(res, status, title, detail, headers = {}) {
  const body = JSON.stringify({
    type: `https://httpstatuses.com/${status}`,
    title,
    status,
    detail
  });
  res.writeHead(status, {
    'Content-Type': 'application/problem+json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    ...headers
  });
  res.end(body);
}

function readJsonBody(req, maxBytes = MAX_BODY_BYTES) {
  return new Promise((resolve, reject) => {
    let bytes = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      bytes += chunk.length;
      if (bytes > maxBytes) {
        req.destroy();
        const err = new Error('Payload Too Large');
        err.status = 413;
        reject(err);
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (chunks.length === 0) return resolve({});
      try {
        const str = Buffer.concat(chunks).toString('utf8');
        const json = JSON.parse(str);
        resolve(json);
      } catch (e) {
        const err = new Error('Malformed JSON');
        err.status = 400;
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

export function getLocalLanAddresses() {
  const nets = os.networkInterfaces();
  const ips = [];
  for (const [iface, list] of Object.entries(nets)) {
    if (!Array.isArray(list)) continue;
    for (const addr of list) {
      if (addr.family === 'IPv4' && !addr.internal && !addr.address.startsWith('169.254.')) {
        ips.push({ iface, address: addr.address });
      }
    }
  }
  return ips;
}

export function parseSkillFrontmatter(content) {
  const out = { name: '', description: '', body: content };
  if (!content || typeof content !== 'string') return out;
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) return out;
  const rawYaml = match[1];
  out.body = match[2];
  for (const line of rawYaml.split(/\r?\n/)) {
    const colonIdx = line.indexOf(':');
    if (colonIdx > 0) {
      const key = line.slice(0, colonIdx).trim();
      const val = line.slice(colonIdx + 1).trim();
      if (key === 'name') out.name = val;
      if (key === 'description') out.description = val;
    }
  }
  return out;
}

export function scanSkillsCatalog(skillsDir) {
  const skills = [];
  if (!fs.existsSync(skillsDir)) return skills;

  let entries = [];
  try {
    entries = fs.readdirSync(skillsDir, { withFileTypes: true });
  } catch {
    return skills;
  }

  for (const entry of entries) {
    if (!entry.isDirectory() && !entry.isSymbolicLink()) continue;
    const skillName = entry.name;
    if (!SKILL_NAME_RE.test(skillName)) continue;

    const skillFilePath = path.join(skillsDir, skillName, 'SKILL.md');
    try {
      if (!fs.existsSync(skillFilePath)) continue;
      const stat = fs.statSync(skillFilePath);
      if (!stat.isFile() || stat.size > 512 * 1024) continue;

      const raw = fs.readFileSync(skillFilePath, 'utf8');
      const { name, description } = parseSkillFrontmatter(raw);
      const meta = DEFAULT_SKILL_DOMAINS[skillName] || {
        domain: 'Generale & Modulare',
        agents: ['turing']
      };

      skills.push({
        id: skillName,
        name: name || skillName,
        description: description || 'Nessuna descrizione specificata.',
        domain: meta.domain,
        agents: meta.agents,
        path: `skills/${skillName}/SKILL.md`,
        modifiedAt: stat.mtime.toISOString(),
        sizeBytes: stat.size
      });
    } catch {
      // Ignore unreadable entries
    }
  }

  skills.sort((a, b) => a.id.localeCompare(b.id));
  return skills;
}

export function readDirectivesFile(filePath) {
  try {
    if (!fs.existsSync(filePath)) {
      const initial = {
        version: '1.0.0',
        updatedAt: new Date().toISOString(),
        directives: []
      };
      const dir = path.dirname(filePath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(filePath, JSON.stringify(initial, null, 2), 'utf8');
      return initial;
    }
    const raw = fs.readFileSync(filePath, 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.directives)) {
      return { version: '1.0.0', updatedAt: new Date().toISOString(), directives: [] };
    }
    return parsed;
  } catch {
    return { version: '1.0.0', updatedAt: new Date().toISOString(), directives: [] };
  }
}

export function writeDirectivesFileAtomic(filePath, data) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const tmpPath = `${filePath}.${Date.now()}.${crypto.randomBytes(4).toString('hex')}.tmp`;
  const serialized = JSON.stringify(data, null, 2);
  fs.writeFileSync(tmpPath, serialized, 'utf8');
  fs.renameSync(tmpPath, filePath);
}

export function createMissionControlStudioServer(config = {}) {
  const rootDir = path.resolve(config.rootDir || DEFAULT_ROOT);
  const studioHtmlPath = path.resolve(config.studioHtmlPath || path.join(rootDir, 'docs', 'mission_control_studio.html'));
  const fallbackHtmlPath = path.resolve(config.fallbackHtmlPath || path.join(rootDir, 'docs', 'mission_control.html'));
  const triageScriptPath = path.resolve(config.triageScript || path.join(__dirname, '..', 'scripts', 'team_triage.py'));
  const skillsDir = path.resolve(config.skillsDir || path.join(rootDir, 'skills'));
  const directivesPath = path.resolve(config.directivesPath || path.join(rootDir, 'directives', 'queue.json'));
  const referencesDir = path.resolve(config.referencesDir || path.join(rootDir, 'portable', 'engineering-team', 'references'));
  const agentsDir = path.resolve(config.agentsDir || path.join(rootDir, 'portable', 'engineering-team', 'agents'));

  const host = config.host || process.env.STUDIO_HOST || process.env.HOST || '0.0.0.0';
  const port = config.port !== undefined
    ? Number(config.port)
    : Number(process.env.STUDIO_PORT || process.env.PORT || 8788);
  const brainDir = config.brainDir || process.env.ANTIGRAVITY_BRAIN_DIR;

  const isLanExposed = !isLoopbackHost(host);
  const rawToken = config.token !== undefined ? (config.token ?? '') : (process.env.MISSION_CONTROL_TOKEN ?? '');
  let authToken = String(rawToken).trim();
  let tokenAutoGenerated = false;
  if (isLanExposed && !authToken) {
    authToken = crypto.randomBytes(18).toString('base64url');
    tokenAutoGenerated = true;
  } else if (isLanExposed && authToken.length < 16) {
    throw new Error('MISSION_CONTROL_TOKEN must be at least 16 characters when binding to LAN');
  }
  const authEnabled = authToken.length > 0;
  const cookieSecret = crypto.createHmac('sha256', crypto.randomBytes(32)).update(authToken || 'studio-local').digest('hex');

  function makeAuthCookieValue(nowMs = Date.now()) {
    const expMs = nowMs + AUTH_COOKIE_TTL_MS;
    const sig = crypto.createHmac('sha256', cookieSecret).update(`mc-studio-auth-v1:${expMs}`).digest('base64url');
    return `${expMs}.${sig}`;
  }

  function isValidAuthCookie(cookieVal) {
    if (!cookieVal || typeof cookieVal !== 'string') return false;
    const dot = cookieVal.indexOf('.');
    if (dot <= 0) return false;
    const expStr = cookieVal.slice(0, dot);
    const sig = cookieVal.slice(dot + 1);
    const expMs = Number(expStr);
    if (!Number.isFinite(expMs) || expMs <= Date.now()) return false;
    const expectedSig = crypto.createHmac('sha256', cookieSecret).update(`mc-studio-auth-v1:${expStr}`).digest('base64url');
    return constantTimeEquals(sig, expectedSig);
  }

  function isAuthorized(req) {
    if (!authEnabled) return true;
    const authHeader = String(req.headers.authorization || '');
    if (authHeader.startsWith('Bearer ')) {
      const provided = authHeader.slice(7).trim();
      if (constantTimeEquals(provided, authToken)) return true;
    }
    const cookies = parseCookies(req.headers.cookie);
    if (cookies.mc_auth && isValidAuthCookie(cookies.mc_auth)) {
      return true;
    }
    const ip = getClientIp(req);
    const isLoopbackIp = ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1';
    if (isLoopbackIp && isAllowedLoopbackHostHeader(req.headers.host)) {
      return true;
    }
    return false;
  }

  const sseClients = new Set();
  const ssePerIp = new Map();
  const rateBuckets = new Map();
  const authFailBuckets = new Map();

  function getClientIp(req) {
    return String(req.socket?.remoteAddress || 'unknown');
  }

  function isAuthBlocked(ip) {
    const b = authFailBuckets.get(ip);
    if (!b) return false;
    const now = Date.now();
    if ((now - b.startMs) > AUTH_FAIL_WINDOW_MS) {
      authFailBuckets.delete(ip);
      return false;
    }
    return b.count >= AUTH_FAIL_MAX;
  }

  function recordAuthFailure(ip) {
    const now = Date.now();
    let b = authFailBuckets.get(ip);
    if (!b || (now - b.startMs) > AUTH_FAIL_WINDOW_MS) {
      b = { startMs: now, count: 0 };
      authFailBuckets.set(ip, b);
    }
    b.count += 1;
    return b.count;
  }

  function clearAuthFailure(ip) {
    authFailBuckets.delete(ip);
  }

  function checkRateLimit(ip) {
    const now = Date.now();
    let bucket = rateBuckets.get(ip);
    if (!bucket || (now - bucket.startMs) > RATE_WINDOW_MS) {
      bucket = { startMs: now, count: 0 };
      rateBuckets.set(ip, bucket);
    }
    bucket.count += 1;
    return bucket.count <= RATE_LIMIT_MAX;
  }

  let lastSnapshotDigest = '';

  function removeSseClient(client) {
    if (!sseClients.delete(client)) return;
    const rem = (ssePerIp.get(client.ip) || 1) - 1;
    if (rem <= 0) ssePerIp.delete(client.ip);
    else ssePerIp.set(client.ip, rem);
    try {
      if (!client.res.destroyed && !client.res.writableEnded) {
        client.res.destroy();
      }
    } catch {
      // ignore
    }
  }

  function safeWriteSse(client, chunk) {
    if (!client || !client.res || client.res.destroyed || client.res.writableEnded) {
      removeSseClient(client);
      return false;
    }
    if ((client.res.writableLength || 0) > MAX_SSE_BUFFER_BYTES) {
      removeSseClient(client);
      return false;
    }
    try {
      client.res.write(chunk);
      return true;
    } catch {
      removeSseClient(client);
      return false;
    }
  }

  function broadcastEvent(eventName, data) {
    if (sseClients.size === 0) return;
    const payload = `event: ${eventName}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const client of [...sseClients]) {
      safeWriteSse(client, payload);
    }
  }

  function refreshSnapshot(convId, bypassCache = false) {
    return readLiveSnapshot({ brainDir, convId, bypassCache });
  }

  function formatEventId(snap) {
    const digest = snap.snapshotDigest || '0';
    const latestEv = snap.events && snap.events.length ? snap.events[snap.events.length - 1] : null;
    return `${digest}:${latestEv ? latestEv.id : (snap.activeConvId || 'none')}`;
  }

  function broadcastSseIfChanged(force = false) {
    if (sseClients.size === 0) return;
    const prevDigest = lastSnapshotDigest;
    let snap;
    try {
      snap = refreshSnapshot(undefined, true);
    } catch {
      return;
    }
    syncActiveWatchers(snap.activeConvId);
    const digest = snap.snapshotDigest || '';
    const eventId = formatEventId(snap);
    const anyBehind = [...sseClients].some((c) => c.lastSentEventId !== eventId);
    if (!force && digest === prevDigest && !anyBehind) return;
    lastSnapshotDigest = digest;

    const payload = `id: ${eventId}\nevent: snapshot\ndata: ${JSON.stringify(snap)}\n\n`;
    for (const client of [...sseClients]) {
      if (client.lastSentEventId === eventId && !force) continue;
      if (safeWriteSse(client, payload)) {
        client.lastSentEventId = eventId;
      }
    }
  }

  const server = http.createServer(async (req, res) => {
    req.setTimeout?.(15_000);
    if (!isLanExposed && !isAllowedLoopbackHostHeader(req.headers.host)) {
      return sendProblem(res, 403, 'Forbidden', 'Invalid Host header for loopback binding.');
    }

    const ip = getClientIp(req);
    if (!checkRateLimit(ip)) {
      return sendProblem(res, 429, 'Too Many Requests', 'Rate limit exceeded. Retry shortly.');
    }

    const method = String(req.method || 'GET').toUpperCase();
    if (method !== 'GET' && method !== 'HEAD' && method !== 'POST') {
      return sendProblem(res, 405, 'Method Not Allowed', 'Only GET, HEAD, and POST methods are permitted.', {
        Allow: 'GET, HEAD, POST'
      });
    }

    let urlObj;
    try {
      urlObj = new URL(req.url || '/', `http://127.0.0.1:${port}`);
    } catch {
      return sendProblem(res, 400, 'Bad Request', 'Malformed request URL.');
    }

    const pathname = urlObj.pathname;
    const isHttps = String(req.headers['x-forwarded-proto'] || '').toLowerCase() === 'https';
    const securityHeaders = {
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Referrer-Policy': 'no-referrer',
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Permissions-Policy': 'accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()',
      ...(isHttps ? { 'Strict-Transport-Security': 'max-age=31536000; includeSubDomains' } : {})
    };

    // CSRF Mitigation on POST requests: require custom header or Bearer auth
    if (method === 'POST') {
      const requestedWith = String(req.headers['x-requested-with'] || '').trim();
      const hasBearer = String(req.headers.authorization || '').startsWith('Bearer ');
      if (requestedWith !== 'Antigravity-MissionControl' && !hasBearer) {
        return sendProblem(
          res,
          403,
          'CSRF Check Failed',
          'Missing mandatory X-Requested-With: Antigravity-MissionControl header.'
        );
      }
    }

    // Route: /healthz
    if (pathname === '/healthz') {
      let brainReadable = false;
      try {
        const resolved = resolveBrainDir(brainDir);
        brainReadable = Boolean(resolved && fs.existsSync(resolved));
      } catch {
        brainReadable = false;
      }
      const skillsCount = scanSkillsCatalog(skillsDir).length;
      const directivesCount = readDirectivesFile(directivesPath).directives.length;

      const body = JSON.stringify({
        status: 'ok',
        health: 'pass',
        edition: 'Antigravity Live Studio (Parallel)',
        version: 'v4.2.0-studio',
        uptime_s: Math.floor(process.uptime()),
        auth_required: authEnabled,
        sse_clients: sseClients.size,
        skills_count: skillsCount,
        directives_count: directivesCount,
        memory_rss_mb: Math.round(process.memoryUsage().rss / 1024 / 1024),
        brain_readable: brainReadable
      });
      res.writeHead(200, {
        ...securityHeaders,
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store'
      });
      if (method === 'HEAD') return res.end();
      return res.end(body);
    }

    // Route: / or /index.html (HTML Studio Cockpit)
    if (pathname === '/' || pathname === '/index.html') {
      try {
        const targetHtml = fs.existsSync(studioHtmlPath) ? studioHtmlPath : fallbackHtmlPath;
        const htmlStat = fs.lstatSync(targetHtml);
        if (htmlStat.isSymbolicLink() || !htmlStat.isFile()) {
          return sendProblem(res, 500, 'HTML Unavailable', 'Studio HTML file is invalid.');
        }
        const html = fs.readFileSync(targetHtml, 'utf8');
        const cspHeader = extractHtmlCsp(html);

        const headers = {
          ...securityHeaders,
          'Content-Security-Policy': cspHeader,
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'no-cache'
        };
        const remoteIp = String(req.socket?.remoteAddress || '');
        const isLoopbackIp = remoteIp === '127.0.0.1' || remoteIp === '::1' || remoteIp === '::ffff:127.0.0.1';
        if (isLoopbackIp && isAllowedLoopbackHostHeader(req.headers.host)) {
          const cookieVal = makeAuthCookieValue();
          headers['Set-Cookie'] = `mc_auth=${cookieVal}; HttpOnly; SameSite=Strict; Path=/; Max-Age=43200`;
        }

        res.writeHead(200, headers);
        if (method === 'HEAD') return res.end();
        return res.end(html);
      } catch {
        return sendProblem(res, 500, 'HTML Read Failure', 'Unable to read Studio HTML file.');
      }
    }

    // Route: /api/auth-cookie
    if (pathname === '/api/auth-cookie') {
      if (!authEnabled) {
        res.writeHead(200, {
          ...securityHeaders,
          'Content-Type': 'application/json; charset=utf-8',
          'Cache-Control': 'no-store'
        });
        if (method === 'HEAD') return res.end();
        return res.end(JSON.stringify({ authenticated: true, authRequired: false }));
      }
      if (isAuthBlocked(ip)) {
        return sendProblem(res, 429, 'Too Many Failed Attempts', 'Authentication temporarily rate-limited.', {
          'Retry-After': '60'
        });
      }
      const authHeader = String(req.headers.authorization || '');
      const provided = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
      if (!constantTimeEquals(provided, authToken)) {
        recordAuthFailure(ip);
        return sendProblem(res, 401, 'Unauthorized', 'Invalid or missing Bearer token.', {
          'WWW-Authenticate': 'Bearer realm="Antigravity Mission Control Studio"'
        });
      }
      clearAuthFailure(ip);
      const cookieVal = makeAuthCookieValue();
      res.writeHead(200, {
        ...securityHeaders,
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
        'Set-Cookie': `mc_auth=${cookieVal}; HttpOnly; SameSite=Strict; Path=/; Max-Age=43200`
      });
      if (method === 'HEAD') return res.end();
      return res.end(JSON.stringify({ authenticated: true, authRequired: true }));
    }

    // Route: /api/live or /api/state
    if (pathname === '/api/live' || pathname === '/api/state') {
      if (authEnabled && isAuthBlocked(ip)) {
        return sendProblem(res, 429, 'Too Many Failed Attempts', 'Authentication rate-limited.', { 'Retry-After': '60' });
      }
      if (!isAuthorized(req)) {
        recordAuthFailure(ip);
        return sendProblem(res, 401, 'Unauthorized', 'Token required for live monitoring feed.');
      }
      clearAuthFailure(ip);
      const convParam = urlObj.searchParams.get('conv') ?? urlObj.searchParams.get('convId');
      if (convParam !== null && !isValidConvId(convParam)) {
        return sendProblem(res, 400, 'Bad Request', 'Parameter conv contains invalid characters.');
      }
      try {
        const snap = readLiveSnapshot({ brainDir, convId: convParam || undefined });
        const payload = JSON.stringify({ ...snap, authRequired: authEnabled, edition: 'studio' });
        res.writeHead(200, {
          ...securityHeaders,
          'Content-Type': 'application/json; charset=utf-8',
          'Cache-Control': 'no-store'
        });
        if (method === 'HEAD') return res.end();
        return res.end(payload);
      } catch (err) {
        // Resilient fallback: return valid 200 OK snapshot in standby rather than crashing frontend with 503
        const emptyAgents = {};
        for (const k of ALL_STATION_AGENTS) {
          emptyAgents[k] = { status: 'idle', role: null, toolName: null, task: null, lastSeenAt: null, subagentState: null };
        }
        const fallbackSnap = {
          schemaVersion: 1,
          serverTime: new Date().toISOString(),
          mode: 'live',
          activeConvId: null,
          workspaceName: 'antigravity-ecosystem',
          sessionStatus: 'idle',
          currentPhase: 0,
          conversations: [],
          agents: emptyAgents,
          transfers: [],
          events: [],
          snapshotDigest: 'fallback-standby',
          authRequired: authEnabled,
          edition: 'studio'
        };
        res.writeHead(200, {
          ...securityHeaders,
          'Content-Type': 'application/json; charset=utf-8',
          'Cache-Control': 'no-store'
        });
        if (method === 'HEAD') return res.end();
        return res.end(JSON.stringify(fallbackSnap));
      }
    }

    // Route: /api/stream or /events (SSE)
    if (pathname === '/api/stream' || pathname === '/events') {
      if (authEnabled && isAuthBlocked(ip)) {
        return sendProblem(res, 429, 'Too Many Failed Attempts', 'Authentication rate-limited.');
      }
      if (!isAuthorized(req)) {
        recordAuthFailure(ip);
        return sendProblem(res, 401, 'Unauthorized', 'Authentication required for live stream.');
      }
      clearAuthFailure(ip);
      if (method === 'HEAD') {
        res.writeHead(200, {
          ...securityHeaders,
          'Content-Type': 'text/event-stream; charset=utf-8',
          'Cache-Control': 'no-store'
        });
        return res.end();
      }
      if (sseClients.size >= MAX_SSE_GLOBAL) {
        return sendProblem(res, 503, 'SSE Capacity Reached', 'Maximum concurrent live viewers reached.');
      }
      const curIpCount = ssePerIp.get(ip) || 0;
      if (curIpCount >= MAX_SSE_PER_IP) {
        return sendProblem(res, 429, 'Too Many Streams', 'Too many concurrent streams from this client IP.');
      }

      req.setTimeout?.(0);
      res.setTimeout?.(0);
      req.socket?.setTimeout?.(0);

      res.writeHead(200, {
        ...securityHeaders,
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-store',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no'
      });

      const lastEventId = String(req.headers['last-event-id'] || '');
      const client = { res, ip, lastSentEventId: lastEventId };
      sseClients.add(client);
      ssePerIp.set(ip, curIpCount + 1);

      const onClose = () => removeSseClient(client);
      req.on('close', onClose);
      res.on('close', onClose);
      res.on('error', onClose);

      try {
        let snap;
        try {
          snap = refreshSnapshot();
        } catch {
          const emptyAgents = {};
          for (const k of ALL_STATION_AGENTS) {
            emptyAgents[k] = { status: 'idle', role: null, toolName: null, task: null, lastSeenAt: null, subagentState: null };
          }
          snap = {
            schemaVersion: 1,
            serverTime: new Date().toISOString(),
            mode: 'live',
            activeConvId: null,
            workspaceName: 'antigravity-ecosystem',
            sessionStatus: 'idle',
            currentPhase: 0,
            conversations: [],
            agents: emptyAgents,
            transfers: [],
            events: [],
            snapshotDigest: 'fallback-standby'
          };
        }
        syncActiveWatchers(snap.activeConvId);
        const evId = formatEventId(snap);
        if (evId !== lastEventId) {
          if (safeWriteSse(client, `id: ${evId}\nevent: snapshot\ndata: ${JSON.stringify(snap)}\n\n`)) {
            client.lastSentEventId = evId;
          }
        } else {
          safeWriteSse(client, ':up-to-date\n\n');
        }
      } catch {
        safeWriteSse(client, 'event: error\ndata: {"message":"brain_unavailable"}\n\n');
      }
      return;
    }

    // Route: GET /api/references (The 12 Canon Books/Manuals)
    if (pathname === '/api/references' && (method === 'GET' || method === 'HEAD')) {
      if (authEnabled && !isAuthorized(req)) {
        return sendProblem(res, 401, 'Unauthorized', 'Authentication required.');
      }
      const agentParam = (urlObj.searchParams.get('agent') || '').toLowerCase().replace(/^@/, '');
      const fileParam = urlObj.searchParams.get('file') || urlObj.searchParams.get('name');

      let targetFilename = fileParam;
      if (!targetFilename && agentParam && AGENT_CANON_MAP[agentParam]) {
        targetFilename = AGENT_CANON_MAP[agentParam].canon;
      }

      if (targetFilename) {
        if (targetFilename.includes('..') || targetFilename.includes('/') || targetFilename.includes('\\')) {
          return sendProblem(res, 400, 'Invalid File', 'Path traversal blocked.');
        }
        const refPath = path.join(referencesDir, targetFilename);
        if (!fs.existsSync(refPath)) {
          return sendProblem(res, 404, 'Reference Not Found', `Manuale ${targetFilename} non trovato.`);
        }
        try {
          const content = fs.readFileSync(refPath, 'utf8');
          const titleMatch = content.match(/^#\s+(.+)$/m);
          const payload = JSON.stringify({
            success: true,
            filename: targetFilename,
            title: titleMatch ? titleMatch[1] : targetFilename,
            agent: agentParam || 'team',
            path: `portable/engineering-team/references/${targetFilename}`,
            content
          });
          res.writeHead(200, {
            ...securityHeaders,
            'Content-Type': 'application/json; charset=utf-8',
            'Cache-Control': 'no-store'
          });
          if (method === 'HEAD') return res.end();
          return res.end(payload);
        } catch {
          return sendProblem(res, 500, 'Read Error', 'Impossibile leggere il manuale.');
        }
      }

      const list = Object.entries(AGENT_CANON_MAP).map(([ag, info]) => ({
        agent: ag,
        filename: info.canon,
        title: info.title,
        path: `portable/engineering-team/references/${info.canon}`
      }));
      res.writeHead(200, {
        ...securityHeaders,
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store'
      });
      if (method === 'HEAD') return res.end();
      return res.end(JSON.stringify({ total: list.length, references: list }));
    }

    // Route: GET /api/agent-prompt (Permanent System Prompt of the Agent)
    if (pathname === '/api/agent-prompt' && (method === 'GET' || method === 'HEAD')) {
      if (authEnabled && !isAuthorized(req)) {
        return sendProblem(res, 401, 'Unauthorized', 'Authentication required.');
      }
      const agentParam = (urlObj.searchParams.get('agent') || 'turing').toLowerCase().replace(/^@/, '');
      const mapping = AGENT_CANON_MAP[agentParam];
      if (!mapping) {
        return sendProblem(res, 400, 'Invalid Agent', `Agente @${agentParam} non trovato.`);
      }
      const promptFile = mapping.prompt;
      const promptPath = path.join(agentsDir, promptFile);
      if (!fs.existsSync(promptPath)) {
        return sendProblem(res, 404, 'Prompt Not Found', `File prompt ${promptFile} non trovato.`);
      }
      try {
        const content = fs.readFileSync(promptPath, 'utf8');
        res.writeHead(200, {
          ...securityHeaders,
          'Content-Type': 'application/json; charset=utf-8',
          'Cache-Control': 'no-store'
        });
        if (method === 'HEAD') return res.end();
        return res.end(JSON.stringify({
          success: true,
          agent: agentParam,
          filename: promptFile,
          path: `portable/engineering-team/agents/${promptFile}`,
          canonFile: mapping.canon,
          canonTitle: mapping.title,
          content
        }));
      } catch {
        return sendProblem(res, 500, 'Read Error', 'Impossibile leggere il prompt di sistema.');
      }
    }

    // Route: GET /api/roster (Dynamic Team Roster & Competencies)
    if (pathname === '/api/roster' && (method === 'GET' || method === 'HEAD')) {
      if (authEnabled && !isAuthorized(req)) {
        return sendProblem(res, 401, 'Unauthorized', 'Authentication required.');
      }
      try {
        const triageScript = triageScriptPath;
        let roster = {};
        if (fs.existsSync(triageScript)) {
          const out = child_process.execFileSync('python3', [triageScript, '--roster', '--json'], { encoding: 'utf8', timeout: 5000 });
          roster = JSON.parse(out);
        }
        res.writeHead(200, {
          ...securityHeaders,
          'Content-Type': 'application/json; charset=utf-8',
          'Cache-Control': 'no-store'
        });
        if (method === 'HEAD') return res.end();
        return res.end(JSON.stringify({ success: true, count: Object.keys(roster).length, roster }));
      } catch (err) {
        return sendProblem(res, 500, 'Roster Error', `Impossibile scansionare il roster: ${err.message}`);
      }
    }

    // Route: POST /api/triage (Intelligent Request Triage Engine)
    if (pathname === '/api/triage' && method === 'POST') {
      try {
        const body = await readJsonBody(req);
        const query = String(body.request || body.query || '').trim();
        if (!query) {
          return sendProblem(res, 400, 'Bad Request', 'Parametro request obbligatorio.');
        }
        const triageScript = triageScriptPath;
        let triageResult = {};
        if (fs.existsSync(triageScript)) {
          const out = child_process.execFileSync('python3', [triageScript, '--triage', query, '--json'], { encoding: 'utf8', timeout: 5000 });
          triageResult = JSON.parse(out);
        }
        res.writeHead(200, {
          ...securityHeaders,
          'Content-Type': 'application/json; charset=utf-8',
          'Cache-Control': 'no-store'
        });
        return res.end(JSON.stringify({ success: true, triage: triageResult }));
      } catch (err) {
        return sendProblem(res, 500, 'Triage Error', `Errore durante il triage: ${err.message}`);
      }
    }

    // Route: GET /api/skills (Listing or Specific Skill Content)
    if (pathname === '/api/skills' && (method === 'GET' || method === 'HEAD')) {
      if (authEnabled && !isAuthorized(req)) {
        return sendProblem(res, 401, 'Unauthorized', 'Authentication required to inspect skills.');
      }
      const singleSkill = urlObj.searchParams.get('name') || urlObj.searchParams.get('id');
      if (singleSkill) {
        if (!SKILL_NAME_RE.test(singleSkill)) {
          return sendProblem(res, 400, 'Invalid Skill Name', 'Skill name contains illegal characters.');
        }
        const skillPath = path.join(skillsDir, singleSkill, 'SKILL.md');
        if (!fs.existsSync(skillPath)) {
          return sendProblem(res, 404, 'Skill Not Found', `Skill '${singleSkill}' does not exist.`);
        }
        try {
          const raw = fs.readFileSync(skillPath, 'utf8');
          const parsed = parseSkillFrontmatter(raw);
          const meta = DEFAULT_SKILL_DOMAINS[singleSkill] || { domain: 'Generale', agents: ['turing'] };
          const payload = JSON.stringify({
            id: singleSkill,
            name: parsed.name || singleSkill,
            description: parsed.description,
            domain: meta.domain,
            agents: meta.agents,
            content: raw,
            body: parsed.body,
            path: `skills/${singleSkill}/SKILL.md`
          });
          res.writeHead(200, {
            ...securityHeaders,
            'Content-Type': 'application/json; charset=utf-8',
            'Cache-Control': 'no-store'
          });
          if (method === 'HEAD') return res.end();
          return res.end(payload);
        } catch {
          return sendProblem(res, 500, 'Skill Read Error', 'Unable to read requested skill file.');
        }
      }

      const skills = scanSkillsCatalog(skillsDir);
      const payload = JSON.stringify({
        total: skills.length,
        count: skills.length,
        skills
      });
      res.writeHead(200, {
        ...securityHeaders,
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store'
      });
      if (method === 'HEAD') return res.end();
      return res.end(payload);
    }

    // Route: POST /api/skills (Create or Update a Skill)
    if (pathname === '/api/skills' && method === 'POST') {
      if (authEnabled && !isAuthorized(req)) {
        return sendProblem(res, 401, 'Unauthorized', 'Authentication required to modify skills.');
      }

      let body;
      try {
        body = await readJsonBody(req);
      } catch (err) {
        return sendProblem(res, err.status || 400, 'Invalid Request Body', err.message);
      }

      const rawName = String(body.name || body.id || '').trim().toLowerCase();
      if (!SKILL_NAME_RE.test(rawName)) {
        return sendProblem(
          res,
          400,
          'Invalid Skill Name',
          'Skill name must match /^[a-z0-9][a-z0-9-]{1,60}$/ (lowercase, alphanumeric and hyphens only).'
        );
      }

      const targetDir = path.resolve(skillsDir, rawName);
      if (!targetDir.startsWith(skillsDir + path.sep)) {
        return sendProblem(res, 403, 'Path Traversal Blocked', 'Target path escapes the skills directory.');
      }

      const description = String(body.description || '').trim();
      let rawContent = String(body.content || '').trim();

      // If content is missing frontmatter, generate clean compliant YAML frontmatter
      if (!rawContent.startsWith('---')) {
        rawContent = `---\nname: ${rawName}\ndescription: ${description || 'Operatività specialistica Antigravity'}\n---\n\n${rawContent || `# ${rawName}\n\nIstruzioni per l'agente.`}`;
      }

      try {
        if (!fs.existsSync(targetDir)) {
          fs.mkdirSync(targetDir, { recursive: true });
        }
        const targetFilePath = path.join(targetDir, 'SKILL.md');
        const tmpFilePath = `${targetFilePath}.${Date.now()}.${crypto.randomBytes(4).toString('hex')}.tmp`;

        fs.writeFileSync(tmpFilePath, rawContent, 'utf8');
        fs.renameSync(tmpFilePath, targetFilePath);

        const updatedSkills = scanSkillsCatalog(skillsDir);
        broadcastEvent('skill-updated', {
          skill: rawName,
          timestamp: new Date().toISOString(),
          totalSkills: updatedSkills.length
        });

        res.writeHead(200, {
          ...securityHeaders,
          'Content-Type': 'application/json; charset=utf-8',
          'Cache-Control': 'no-store'
        });
        return res.end(JSON.stringify({
          success: true,
          skill: rawName,
          path: `skills/${rawName}/SKILL.md`,
          message: 'Skill salvata e sincronizzata con Antigravity.'
        }));
      } catch (err) {
        return sendProblem(res, 500, 'Skill Save Error', `Impossibile salvare la skill: ${err.message}`);
      }
    }

    // Route: GET /api/directives (List Active Directives)
    if (pathname === '/api/directives' && (method === 'GET' || method === 'HEAD')) {
      if (authEnabled && !isAuthorized(req)) {
        return sendProblem(res, 401, 'Unauthorized', 'Authentication required to view directives.');
      }
      const data = readDirectivesFile(directivesPath);
      const targetFilter = urlObj.searchParams.get('agent');
      let filtered = data.directives;
      if (targetFilter) {
        filtered = filtered.filter((d) => d.targetAgent === targetFilter || d.targetAgent === 'all');
      }

      res.writeHead(200, {
        ...securityHeaders,
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store'
      });
      if (method === 'HEAD') return res.end();
      return res.end(JSON.stringify({
        version: data.version,
        updatedAt: data.updatedAt,
        total: filtered.length,
        directives: filtered
      }));
    }

    // Route: POST /api/directives (Dispatch Directive to Agent)
    if (pathname === '/api/directives' && method === 'POST') {
      if (authEnabled && !isAuthorized(req)) {
        return sendProblem(res, 401, 'Unauthorized', 'Authentication required to dispatch directives.');
      }

      let body;
      try {
        body = await readJsonBody(req);
      } catch (err) {
        return sendProblem(res, err.status || 400, 'Invalid Request Body', err.message);
      }

      const targetAgent = String(body.targetAgent || body.agent || '').trim().toLowerCase().replace(/^@/, '');
      const validAgents = [...ALL_STATION_AGENTS, 'all', 'team'];
      if (!validAgents.includes(targetAgent)) {
        return sendProblem(res, 400, 'Invalid Target Agent', `Agente target '${targetAgent}' non riconosciuto.`);
      }

      const directiveText = String(body.directive || body.message || '').trim();
      if (!directiveText || directiveText.length < 3 || directiveText.length > 2000) {
        return sendProblem(res, 400, 'Invalid Directive Text', 'La direttiva deve essere compresa tra 3 e 2000 caratteri.');
      }

      const title = String(body.title || 'Nuova Istruzione dal Monitor').trim().slice(0, 100);
      const priority = ['normal', 'high', 'urgent', 'veto'].includes(body.priority) ? body.priority : 'normal';

      const prefix = priority === 'veto'
        ? '[VETO / BLOCCANTE]'
        : priority === 'urgent'
        ? '[URGENTE]'
        : priority === 'high'
        ? '[PRIORITÀ ALTA]'
        : '[DIRETTIVA STUDIO]';

      const promptTemplate = targetAgent === 'all' || targetAgent === 'team'
        ? `@turing ${prefix}: ${directiveText}`
        : `@${targetAgent} ${prefix}: ${directiveText}`;

      const newDirective = {
        id: `dir_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`,
        targetAgent,
        title,
        directive: directiveText,
        priority,
        status: 'active',
        createdAt: new Date().toISOString(),
        antigravityPrompt: promptTemplate
      };

      try {
        const store = readDirectivesFile(directivesPath);
        store.directives.unshift(newDirective);
        // Cap history to 100 items to keep files nimble
        if (store.directives.length > 100) {
          store.directives = store.directives.slice(0, 100);
        }
        store.updatedAt = new Date().toISOString();
        writeDirectivesFileAtomic(directivesPath, store);

        broadcastEvent('directive-created', newDirective);

        res.writeHead(200, {
          ...securityHeaders,
          'Content-Type': 'application/json; charset=utf-8',
          'Cache-Control': 'no-store'
        });
        return res.end(JSON.stringify({
          success: true,
          directive: newDirective,
          message: `Direttiva per @${targetAgent} registrata e trasmessa al team.`
        }));
      } catch (err) {
        return sendProblem(res, 500, 'Directive Save Error', `Impossibile salvare la direttiva: ${err.message}`);
      }
    }

    // Route: POST /api/directives/status (Update Directive Status)
    if (pathname === '/api/directives/status' && method === 'POST') {
      if (authEnabled && !isAuthorized(req)) {
        return sendProblem(res, 401, 'Unauthorized', 'Authentication required.');
      }
      let body;
      try {
        body = await readJsonBody(req);
      } catch (err) {
        return sendProblem(res, err.status || 400, 'Invalid Request Body', err.message);
      }
      const dirId = String(body.id || '').trim();
      const newStatus = ['active', 'completed', 'dismissed'].includes(body.status) ? body.status : 'completed';

      try {
        const store = readDirectivesFile(directivesPath);
        const item = store.directives.find((d) => d.id === dirId);
        if (!item) {
          return sendProblem(res, 404, 'Directive Not Found', `Direttiva '${dirId}' non trovata.`);
        }
        item.status = newStatus;
        item.resolvedAt = new Date().toISOString();
        store.updatedAt = new Date().toISOString();
        writeDirectivesFileAtomic(directivesPath, store);

        broadcastEvent('directive-updated', item);

        res.writeHead(200, {
          ...securityHeaders,
          'Content-Type': 'application/json; charset=utf-8',
          'Cache-Control': 'no-store'
        });
        return res.end(JSON.stringify({ success: true, directive: item }));
      } catch (err) {
        return sendProblem(res, 500, 'Directive Update Error', err.message);
      }
    }

    return sendProblem(res, 404, 'Not Found', 'Endpoint not available.');
  });

  server.requestTimeout = 15_000;
  server.headersTimeout = 10_000;
  server.keepAliveTimeout = 5_000;
  server.maxHeadersCount = 100;

  let pollTimer = null;
  let heartbeatTimer = null;
  let fsWatcher = null;
  let watchedConvId = '';
  let activeSubWatchers = [];
  let debounceTimer = null;

  function scheduleBroadcast() {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => broadcastSseIfChanged(false), 120);
  }

  function closeActiveWatchers() {
    for (const w of activeSubWatchers) {
      try { w.close(); } catch {}
    }
    activeSubWatchers = [];
    watchedConvId = '';
  }

  function ensureRootFsWatcher() {
    if (fsWatcher) return;
    try {
      const baseReal = resolveBrainDir(brainDir);
      if (baseReal) {
        const w = fs.watch(baseReal, { recursive: false }, scheduleBroadcast);
        w.on('error', () => {
          try { w.close(); } catch {}
          if (fsWatcher === w) fsWatcher = null;
        });
        fsWatcher = w;
      }
    } catch {
      // Polling remains active fallback
    }
  }

  function syncActiveWatchers(convId) {
    if (!convId || !isValidConvId(convId)) return;
    let baseReal;
    try {
      baseReal = resolveBrainDir(brainDir);
    } catch {
      return;
    }
    if (!baseReal) return;

    const existingWatchPaths = [];
    const logsReal = resolveSafeSubdir(baseReal, convId, '.system_generated', 'logs');
    if (logsReal) existingWatchPaths.push(logsReal);
    const saDirReal = resolveSafeSubdir(baseReal, convId, '.system_generated', 'subagents');
    if (saDirReal) {
      existingWatchPaths.push(saDirReal);
      try {
        for (const f of fs.readdirSync(saDirReal)) {
          if (!f.endsWith('.json')) continue;
          let childId = f.replace(/\.json$/, '');
          try {
            const p = path.join(saDirReal, f);
            const lst = fs.lstatSync(p);
            if (!lst.isSymbolicLink() && lst.isFile() && lst.size <= 65536) {
              const parsed = JSON.parse(fs.readFileSync(p, 'utf8'));
              if (parsed && typeof parsed.conversationId === 'string') {
                childId = parsed.conversationId;
              }
            }
          } catch {
            // keep stem
          }
          if (isValidConvId(childId)) {
            const childLogsReal = resolveSafeSubdir(baseReal, childId, '.system_generated', 'logs');
            if (childLogsReal && !existingWatchPaths.includes(childLogsReal)) {
              existingWatchPaths.push(childLogsReal);
            }
          }
        }
      } catch {
        // ignore if unreadable
      }
    }

    const signature = `${convId}:${existingWatchPaths.join('|')}`;
    if (signature === watchedConvId) return;
    closeActiveWatchers();
    watchedConvId = signature;

    for (const wp of existingWatchPaths) {
      try {
        const w = fs.watch(wp, { recursive: false }, scheduleBroadcast);
        w.on('error', () => {
          try { w.close(); } catch {}
          watchedConvId = '';
        });
        activeSubWatchers.push(w);
      } catch {
        // Ignore watch race condition
      }
    }
  }

  function startBackgroundWatchers() {
    pollTimer = setInterval(() => {
      ensureRootFsWatcher();
      broadcastSseIfChanged(false);
    }, LIVE_POLL_MS);
    heartbeatTimer = setInterval(() => {
      for (const client of [...sseClients]) {
        safeWriteSse(client, 'event: ping\ndata: {}\n\n');
      }
    }, SSE_HEARTBEAT_MS);
  }

  function stopBackgroundWatchers() {
    clearInterval(pollTimer);
    clearInterval(heartbeatTimer);
    clearTimeout(debounceTimer);
    if (fsWatcher) {
      try { fsWatcher.close(); } catch {}
      fsWatcher = null;
    }
    closeActiveWatchers();
    for (const client of [...sseClients]) {
      removeSseClient(client);
    }
    sseClients.clear();
    ssePerIp.clear();
  }

  return {
    server,
    host,
    port,
    authEnabled,
    authToken,
    tokenAutoGenerated,
    isLanExposed,
    dispatch(req, res) {
      server.emit('request', req, res);
    },
    pollNow(force = false) {
      broadcastSseIfChanged(force);
    },
    start() {
      return new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(port, host, () => {
          server.removeListener('error', reject);
          startBackgroundWatchers();
          resolve(server.address());
        });
      });
    },
    stop() {
      stopBackgroundWatchers();
      server.closeIdleConnections?.();
      return new Promise((resolve) => {
        if (!server.listening) {
          resolve();
          return;
        }
        server.close(() => resolve());
      });
    }
  };
}

// CLI execution when invoked directly
const isMain = process.argv[1] && path.resolve(process.argv[1]) === __filename;
if (isMain) {
  const srv = createMissionControlStudioServer();
  srv.start()
    .then((addr) => {
      const actualPort = typeof addr === 'object' && addr ? addr.port : srv.port;
      console.log('==================================================================');
      console.log(' 🚀 Antigravity Live Studio & Cockpit (Parallel Edition)');
      console.log('==================================================================');
      console.log(` Localhost : http://127.0.0.1:${actualPort}`);
      if (srv.isLanExposed) {
        const lanIps = getLocalLanAddresses();
        if (lanIps.length > 0) {
          lanIps.forEach((item) => {
            console.log(` LAN (${item.iface}) : http://${item.address}:${actualPort}`);
          });
        } else {
          console.log(` LAN Bind  : http://0.0.0.0:${actualPort}`);
        }
      }
      console.log(' Features  : Live Mind Stream · Directives Console · Skill Workshop');
      if (srv.authEnabled) {
        console.log(` Auth LAN  : ATTIVA (Bearer / Cookie HttpOnly)`);
        console.log(` Token     : ${srv.authToken}`);
      } else {
        console.log(' Auth LAN  : Loopback-only (nessun token richiesto su 127.0.0.1)');
      }
      console.log('==================================================================');
    })
    .catch((err) => {
      console.error(`[ERROR] Impossibile avviare lo Studio Server: ${err.message}`);
      process.exit(1);
    });

  const shutdown = async () => {
    await srv.stop();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

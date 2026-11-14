#!/usr/bin/env node
/**
 * mission_control_server.mjs — Hardened zero-dependency Node.js web + SSE server
 * Serves docs/mission_control.html and exposes read-only live Antigravity monitoring.
 *
 * Security invariants:
 * - Zero child_process usage
 * - GET / HEAD only (405 otherwise), fixed route allowlist (404 otherwise)
 * - Fail-closed Bearer/Cookie token authentication on non-loopback binds (0.0.0.0 / LAN)
 * - Timing-safe comparison & HttpOnly SameSite=Strict session cookie (never token in query string)
 * - CSP HTTP header with frame-ancestors 'none', Cache-Control: no-store on APIs
 * - SSE cap (max 20 global, 4 per IP) + HTTP rate limiting + socket timeouts
 */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { readLiveSnapshot, isValidConvId, resolveBrainDir, resolveSafeSubdir } from './antigravity_reader.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DEFAULT_ROOT = path.resolve(__dirname, '..');

export const MODEL_TIERING = {
  tier_0: {
    name: 'AST / Regex Locali',
    latency: '< 10ms',
    cost_per_1m_in_out: '$0.00 (0 tok)',
    scope: 'Security Linter, Doctest Gate, AST parser'
  },
  tier_1: {
    name: 'Gemini Flash (2.5/3.0)',
    latency: '150-300ms',
    cost_per_1m_in_out: '$0.075 / $0.30',
    scope: 'Triage, routing rapido, classificazione, streaming'
  },
  tier_2: {
    name: 'Gemini 3.1 Pro',
    latency: '500ms-2s',
    cost_per_1m_in_out: '$1.25 / $5.00',
    scope: 'Ingegneria avanzata, refactoring, audit, architecture'
  },
  tier_3: {
    name: 'Gemini 4 Argon / Jules',
    latency: 'Async/Multi',
    cost_per_1m_in_out: '$2.50 / $10.00',
    scope: 'Agenti autonomi, Deep Research, task multi-step'
  }
};

export const THINKING_BUDGET_PRESETS = {
  off: 0,
  standard: 2048,
  deep: 8192
};

export function getCanonTokensEstimate(rootDir = DEFAULT_ROOT) {
  const referencesDir = path.join(rootDir, 'portable', 'engineering-team', 'references');
  let totalChars = 0;
  try {
    if (fs.existsSync(referencesDir)) {
      const files = fs.readdirSync(referencesDir);
      for (const f of files) {
        if (!f.endsWith('.md')) continue;
        const fullPath = path.join(referencesDir, f);
        const st = fs.lstatSync(fullPath);
        if (st.isFile() && !st.isSymbolicLink()) {
          const content = fs.readFileSync(fullPath, 'utf8');
          totalChars += content.length;
        }
      }
    }
  } catch {
    // fallback se la directory non è accessibile
  }
  if (totalChars > 0) {
    return Math.round(totalChars / 3.8);
  }
  return 21895; // stima canonica static baseline (~21.895 token)
}

export function getCacheBundleStatus(rootDir = DEFAULT_ROOT) {
  const candidatePaths = [
    path.join(rootDir, 'system_context_v5.json'),
    path.join(rootDir, 'portable', 'system_context_v5.json'),
    path.join(rootDir, 'portable', 'engineering-team', 'system_context_v5.json'),
    path.join(rootDir, 'references', 'system_context_v5.json')
  ];

  for (const cand of candidatePaths) {
    try {
      if (fs.existsSync(cand)) {
        const st = fs.lstatSync(cand);
        if (st.isFile() && !st.isSymbolicLink()) {
          const content = fs.readFileSync(cand);
          const sha256 = crypto.createHash('sha256').update(content).digest('hex');
          return {
            present: true,
            path: path.relative(rootDir, cand),
            sha256,
            bytes: st.size,
            timestamp: st.mtime.toISOString(),
            status: 'ready'
          };
        }
      }
    } catch {
      // ignora candidato non leggibile
    }
  }

  return {
    present: false,
    path: 'portable/system_context_v5.json',
    sha256: null,
    bytes: 0,
    timestamp: null,
    status: 'unbundled'
  };
}

export function getTokenMetrics(rootDir = DEFAULT_ROOT) {
  return {
    canon_tokens: getCanonTokensEstimate(rootDir),
    savings_estimate_percent: 75.0,
    model_tiering: MODEL_TIERING,
    thinking_budget_presets: THINKING_BUDGET_PRESETS,
    cache_bundle: getCacheBundleStatus(rootDir),
    timestamp: new Date().toISOString()
  };
}

const MAX_SSE_GLOBAL = 20;
const MAX_SSE_PER_IP = 4;
const MAX_SSE_BUFFER_BYTES = 262_144;
const RATE_WINDOW_MS = 10_000;
const RATE_LIMIT_MAX = 150;
const AUTH_FAIL_WINDOW_MS = 60_000;
const AUTH_FAIL_MAX = 6;
const AUTH_COOKIE_TTL_MS = 12 * 60 * 60 * 1000;
const SSE_HEARTBEAT_MS = 15_000;
const LIVE_POLL_MS = 450;

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

export function createMissionControlServer(config = {}) {
  const rootDir = path.resolve(config.rootDir || DEFAULT_ROOT);
  const htmlPath = path.resolve(config.htmlPath || path.join(rootDir, 'docs', 'mission_control.html'));
  const host = config.host || process.env.HOST || '127.0.0.1';
  const port = config.port !== undefined ? Number(config.port) : Number(process.env.PORT || 8787);
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
  const cookieSecret = crypto.createHmac('sha256', crypto.randomBytes(32)).update(authToken || 'local').digest('hex');

  function makeAuthCookieValue(nowMs = Date.now()) {
    const expMs = nowMs + AUTH_COOKIE_TTL_MS;
    const sig = crypto.createHmac('sha256', cookieSecret).update(`mc-auth-v1:${expMs}`).digest('base64url');
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
    const expectedSig = crypto.createHmac('sha256', cookieSecret).update(`mc-auth-v1:${expStr}`).digest('base64url');
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
    if (authFailBuckets.size > 1000) {
      for (const [k, v] of authFailBuckets.entries()) {
        if ((now - v.startMs) > AUTH_FAIL_WINDOW_MS) authFailBuckets.delete(k);
      }
    }
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
    if (rateBuckets.size > 1000) {
      for (const [k, b] of rateBuckets.entries()) {
        if ((now - b.startMs) > RATE_WINDOW_MS) rateBuckets.delete(k);
      }
    }
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
      // ignore destroy errors
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

  function refreshSnapshot(convId, bypassCache = false) {
    const snap = readLiveSnapshot({ brainDir, convId, bypassCache });
    snap.token_economics = getTokenMetrics(rootDir);
    return snap;
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
    const digest = snap.snapshotDigest || '';
    const eventId = formatEventId(snap);
    const anyBehind = [...sseClients].some((c) => c.lastSentEventId !== eventId);
    if (!force && digest === prevDigest && !anyBehind) return;
    lastSnapshotDigest = digest;
    syncActiveWatchers(snap.activeConvId);

    const payload = `id: ${eventId}\nevent: snapshot\ndata: ${JSON.stringify(snap)}\n\n`;

    for (const client of [...sseClients]) {
      if (client.lastSentEventId === eventId && !force) continue;
      if (safeWriteSse(client, payload)) {
        client.lastSentEventId = eventId;
      }
    }
  }

  const server = http.createServer((req, res) => {
    req.setTimeout?.(10_000);
    if (!isLanExposed && !isAllowedLoopbackHostHeader(req.headers.host)) {
      return sendProblem(res, 403, 'Forbidden', 'Invalid Host header for loopback binding.');
    }

    const ip = getClientIp(req);
    if (!checkRateLimit(ip)) {
      return sendProblem(res, 429, 'Too Many Requests', 'Rate limit exceeded. Retry shortly.');
    }

    const method = String(req.method || 'GET').toUpperCase();
    if (method !== 'GET' && method !== 'HEAD') {
      return sendProblem(res, 405, 'Method Not Allowed', 'Only GET and HEAD methods are permitted.', {
        Allow: 'GET, HEAD'
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

    // Route: /healthz (public probe for Docker/Kubernetes/reverse proxies)
    if (pathname === '/healthz') {
      let brainReadable = false;
      try {
        const resolved = resolveBrainDir(brainDir);
        brainReadable = Boolean(resolved && fs.existsSync(resolved));
      } catch {
        brainReadable = false;
      }

      const body = JSON.stringify({
        status: 'ok',
        health: 'pass',
        version: 'v5.0.0',
        uptime_s: Math.floor(process.uptime()),
        auth_required: authEnabled,
        authRequired: authEnabled,
        sse_clients: sseClients.size,
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

    // Route: / or /index.html (HTML console itself contains zero live secrets)
    if (pathname === '/' || pathname === '/index.html') {
      try {
        const htmlStat = fs.lstatSync(htmlPath);
        if (htmlStat.isSymbolicLink() || !htmlStat.isFile()) {
          return sendProblem(res, 500, 'HTML Unavailable', 'Mission Control HTML file is invalid.');
        }
        const html = fs.readFileSync(htmlPath, 'utf8');
        const cspHeader = extractHtmlCsp(html);

        res.writeHead(200, {
          ...securityHeaders,
          'Content-Security-Policy': cspHeader,
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'no-cache'
        });
        if (method === 'HEAD') return res.end();
        return res.end(html);
      } catch {
        return sendProblem(res, 500, 'HTML Read Failure', 'Unable to read docs/mission_control.html.');
      }
    }

    // All API routes require authentication if enabled (never accept token in query string)
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
          'WWW-Authenticate': 'Bearer realm="Antigravity Mission Control"'
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

    // Route: /api/metrics/tokens (GET e HEAD)
    if (pathname === '/api/metrics/tokens') {
      if (authEnabled && isAuthBlocked(ip)) {
        return sendProblem(res, 429, 'Too Many Failed Attempts', 'Authentication temporarily rate-limited.', {
          'Retry-After': '60'
        });
      }
      if (!isAuthorized(req)) {
        recordAuthFailure(ip);
        return sendProblem(res, 401, 'Unauthorized', 'Token required for token metrics.', {
          'WWW-Authenticate': 'Bearer realm="Antigravity Mission Control"'
        });
      }
      clearAuthFailure(ip);

      const metrics = getTokenMetrics(rootDir);
      const payload = JSON.stringify(metrics);

      res.writeHead(200, {
        ...securityHeaders,
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store'
      });
      if (method === 'HEAD') return res.end();
      return res.end(payload);
    }

    if (pathname === '/api/live' || pathname === '/api/state') {
      if (authEnabled && isAuthBlocked(ip)) {
        return sendProblem(res, 429, 'Too Many Failed Attempts', 'Authentication temporarily rate-limited.', {
          'Retry-After': '60'
        });
      }
      if (!isAuthorized(req)) {
        recordAuthFailure(ip);
        return sendProblem(res, 401, 'Unauthorized', 'Token required for live monitoring feed.', {
          'WWW-Authenticate': 'Bearer realm="Antigravity Mission Control"'
        });
      }
      clearAuthFailure(ip);
      const convParam = urlObj.searchParams.get('conv') ?? urlObj.searchParams.get('convId');
      if (convParam !== null && !isValidConvId(convParam)) {
        return sendProblem(res, 400, 'Bad Request', 'Parameter conv contains invalid characters.');
      }
      try {
        const snap = refreshSnapshot(convParam || undefined);
        const payload = JSON.stringify({ ...snap, authRequired: authEnabled });

        res.writeHead(200, {
          ...securityHeaders,
          'Content-Type': 'application/json; charset=utf-8',
          'Cache-Control': 'no-store'
        });
        if (method === 'HEAD') return res.end();
        return res.end(payload);
      } catch (err) {
        return sendProblem(
          res,
          err.status || 503,
          err.code || 'Live Reader Unavailable',
          err.message || 'Unable to inspect Antigravity brain directory.'
        );
      }
    }

    if (pathname === '/api/stream' || pathname === '/events') {
      if (authEnabled && isAuthBlocked(ip)) {
        return sendProblem(res, 429, 'Too Many Failed Attempts', 'Authentication temporarily rate-limited.', {
          'Retry-After': '60'
        });
      }
      if (!isAuthorized(req)) {
        recordAuthFailure(ip);
        return sendProblem(res, 401, 'Unauthorized', 'Authentication required for live stream.', {
          'WWW-Authenticate': 'Bearer realm="Antigravity Mission Control"'
        });
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

      // SSE streams stay open indefinitely: disable per-request socket idle timeout ONLY for GET SSE
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
        const snap = refreshSnapshot();
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

    return sendProblem(res, 404, 'Not Found', 'Endpoint not available.');
  });

  server.requestTimeout = 15_000;
  server.headersTimeout = 5_000;
  server.keepAliveTimeout = 5_000;

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

    ensureRootFsWatcher();
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

  // Socket timeout and Slowloris protections for production
  server.requestTimeout = 15_000;
  server.headersTimeout = 10_000;
  server.keepAliveTimeout = 5_000;
  server.maxHeadersCount = 100;

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
        server.close(() => resolve());
      });
    }
  };
}

// CLI execution when invoked directly
const isMain = process.argv[1] && path.resolve(process.argv[1]) === __filename;
if (isMain) {
  const srv = createMissionControlServer();
  srv.start()
    .then((addr) => {
      const actualPort = typeof addr === 'object' && addr ? addr.port : srv.port;
      console.log('==================================================================');
      console.log(' Antigravity Mission Control — Live Web Server');
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
      console.log(' Feed Mode : Soltanto metadati sanitizzati (zero prompt/segreti)');
      if (srv.authEnabled) {
        console.log(` Auth LAN  : ATTIVA (Bearer / Cookie HttpOnly)`);
        console.log(` Token     : ${srv.authToken}`);
        if (srv.tokenAutoGenerated && process.env.NODE_ENV === 'production') {
          console.warn(' [AVVISO] NODE_ENV=production con token auto-generato. Imposta MISSION_CONTROL_TOKEN per la persistenza del token tra i riavvii.');
        }
      } else {
        console.log(' Auth LAN  : Loopback-only (nessun token richiesto su 127.0.0.1)');
      }
      console.log('==================================================================');
    })
    .catch((err) => {
      console.error(`[ERROR] Impossibile avviare il server: ${err.message}`);
      process.exit(1);
    });

  const shutdown = async () => {
    await srv.stop();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

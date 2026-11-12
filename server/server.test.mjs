import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { fileURLToPath } from 'node:url';

import {
  sanitizeSummary,
  isValidConvId,
  readLiveSnapshot
} from './antigravity_reader.mjs';
import { createMissionControlServer } from './mission_control_server.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');

function makeTempBrain(prefix = 'ag-mc-test-') {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function writeConvFixture(brainDir, convId, transcriptLines, subagents = {}) {
  const convDir = path.join(brainDir, convId);
  const logsDir = path.join(convDir, '.system_generated', 'logs');
  const subDir = path.join(convDir, '.system_generated', 'subagents');
  fs.mkdirSync(logsDir, { recursive: true });
  fs.mkdirSync(subDir, { recursive: true });

  const body = transcriptLines
    .map((line) => (typeof line === 'string' ? line : JSON.stringify(line)))
    .join('\n') + '\n';
  fs.writeFileSync(path.join(logsDir, 'transcript.jsonl'), body, 'utf8');

  for (const [saId, saData] of Object.entries(subagents)) {
    fs.writeFileSync(path.join(subDir, `${saId}.json`), JSON.stringify(saData), 'utf8');
  }
}

function dispatchRequest(srv, reqPath, options = {}) {
  return new Promise((resolve) => {
    const req = new EventEmitter();
    req.url = reqPath;
    req.method = options.method || 'GET';
    req.headers = Object.fromEntries(
      Object.entries(options.headers || {}).map(([k, v]) => [k.toLowerCase(), v])
    );
    req.socket = {
      remoteAddress: options.remoteAddress || '127.0.0.1',
      setTimeout() {}
    };

    const res = new EventEmitter();
    res.statusCode = 200;
    const hdrs = {};
    const chunks = [];
    res.writeHead = (status, h = {}) => {
      res.statusCode = status;
      for (const [k, v] of Object.entries(h)) {
        hdrs[k.toLowerCase()] = v;
      }
      if (options.streamMatch && status === 200) {
        // Streaming SSE mode: wait for chunk match below
      }
    };
    res.write = (chunk) => {
      const str = Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk);
      chunks.push(str);
      const joined = chunks.join('');
      if (options.streamMatch && options.streamMatch(joined)) {
        req.emit('close');
        resolve({ status: res.statusCode, headers: hdrs, body: joined });
      }
      return true;
    };
    res.end = (chunk = '') => {
      if (chunk) chunks.push(Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk));
      resolve({ status: res.statusCode, headers: hdrs, body: chunks.join('') });
    };

    srv.dispatch(req, res);
  });
}

test('sanitizeSummary redacts Bearer, API keys, JWTs, DB passwords, and user home paths', () => {
  const raw = 'Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.payloadpart123.sigpart456 MYSQL_ROOT_PASSWORD=ultra_secret_pw /Users/alice/projects/antigravity-ecosystem/docs/mission_control.html sk-1234567890abcdef';
  const clean = sanitizeSummary(raw, ['antigravity-ecosystem']);
  assert.ok(!clean.includes('ultra_secret_pw'), 'password must be redacted');
  assert.ok(!clean.includes('payloadpart123'), 'JWT must be redacted');
  assert.ok(!clean.includes('sk-1234567890abcdef'), 'API key must be redacted');
  assert.ok(!clean.includes('/Users/alice'), 'home directory must not leak');
  assert.ok(clean.length <= 96, 'summary must stay capped');
});

test('isValidConvId blocks path traversal and malformed IDs', () => {
  assert.equal(isValidConvId('918ff04a-c80f-45e2-a418-0d0d2b0bb6c0'), true);
  assert.equal(isValidConvId('abc12345_ok'), true);
  assert.equal(isValidConvId('../etc'), false);
  assert.equal(isValidConvId('918ff04a/../etc'), false);
  assert.equal(isValidConvId('.hidden-id'), false);
  assert.equal(isValidConvId('short'), false);
  assert.equal(isValidConvId('bad%2fconv'), false);
});

test('readLiveSnapshot tolerates missing directory and truncated/corrupt JSONL lines', () => {
  const missingSnap = readLiveSnapshot({ brainDir: path.join(os.tmpdir(), 'definitely-missing-ag-brain-' + Date.now()) });
  assert.equal(missingSnap.mode, 'live');
  assert.equal(missingSnap.activeConvId, null);
  assert.equal(missingSnap.phoenix.active, false);

  const brainDir = makeTempBrain();
  try {
    const convId = '11111111-2222-3333-4444-555555555555';
    const nowIso = new Date().toISOString();
    writeConvFixture(brainDir, convId, [
      '{not-valid-json',
      {
        step_index: 1,
        source: 'MODEL',
        type: 'PLANNER_RESPONSE',
        status: 'DONE',
        created_at: nowIso,
        tool_calls: [
          {
            name: 'read_file',
            args: JSON.stringify({ Path: '/Users/manuele/.gemini/antigravity/scratch/antigravity-ecosystem/docs/mission_control.html' })
          }
        ]
      },
      '{"step_index":2,"truncated_partial":'
    ]);

    const snap = readLiveSnapshot({ brainDir });
    assert.equal(snap.activeConvId, convId);
    assert.equal(snap.workspaceName, 'antigravity-ecosystem');
    assert.equal(snap.phoenix.active, false);
    assert.ok(['inspecting', 'working'].includes(snap.agents.turing.status));
  } finally {
    fs.rmSync(brainDir, { recursive: true, force: true });
  }
});

test('readLiveSnapshot activates Stanza Fenice on fenice confpd / pacioli / biagi / munari activity', () => {
  const brainDir = makeTempBrain();
  try {
    const convId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
    const nowIso = new Date().toISOString();
    writeConvFixture(brainDir, convId, [
      {
        step_index: 1,
        source: 'MODEL',
        type: 'PLANNER_RESPONSE',
        status: 'DONE',
        created_at: nowIso,
        tool_calls: [
          {
            name: 'read_file',
            args: JSON.stringify({ Path: '/Users/manuele/.gemini/antigravity/scratch/fenice confpd/README.md' })
          },
          {
            name: 'invoke_subagent',
            args: JSON.stringify({ TypeName: 'pacioli', Role: 'Analisi Fiscale OIC IRES' })
          }
        ]
      }
    ], {
      'sub-pacioli-1': {
        conversationId: 'sub-pacioli-1',
        subagentDescriptor: { typeName: 'pacioli', role: 'Fiscale & OIC' },
        state: 'SUBAGENT_STATE_ALIVE',
        spawnStepIndex: 1
      },
      'sub-biagi-1': {
        conversationId: 'sub-biagi-1',
        subagentDescriptor: { typeName: 'biagi', role: 'Paghe & CCNL' },
        state: 'SUBAGENT_STATE_ALIVE',
        spawnStepIndex: 1
      },
      'sub-munari-1': {
        conversationId: 'sub-munari-1',
        subagentDescriptor: { typeName: 'munari', role: 'Plain Language Bento' },
        state: 'SUBAGENT_STATE_ALIVE',
        spawnStepIndex: 1
      }
    });

    const snap = readLiveSnapshot({ brainDir });
    assert.equal(snap.phoenix.active, true);
    assert.notEqual(snap.agents.pacioli.status, 'idle');
    assert.notEqual(snap.agents.biagi.status, 'idle');
    assert.notEqual(snap.agents.munari.status, 'idle');
  } finally {
    fs.rmSync(brainDir, { recursive: true, force: true });
  }
});

test('mission_control_server enforces fail-closed Bearer/Cookie auth, CSP headers, and SSE streaming', async () => {
  const brainDir = makeTempBrain();
  const convId = '99999999-8888-7777-6666-555555555555';
  const nowIso = new Date().toISOString();
  writeConvFixture(brainDir, convId, [
    {
      step_index: 1,
      source: 'MODEL',
      type: 'PLANNER_RESPONSE',
      status: 'DONE',
      created_at: nowIso,
      content: 'Audit completo token Bearer super_secret_999',
      tool_calls: [{ name: 'run_command', args: JSON.stringify({ CommandLine: 'npm test', toolSummary: 'Run test suite' }) }]
    }
  ]);

  const token = 'test-lan-token-2026-secure';
  const srv = createMissionControlServer({
    rootDir: REPO_ROOT,
    host: '0.0.0.0',
    port: 0,
    brainDir,
    token
  });

  assert.equal(srv.isLanExposed, true);
  assert.equal(srv.authEnabled, true);

  try {
    // 1. Root HTML + strict security headers
    const rootRes = await dispatchRequest(srv, '/');
    assert.equal(rootRes.status, 200);
    assert.ok(rootRes.headers['content-security-policy']?.includes("frame-ancestors 'none'"));
    assert.ok(rootRes.headers['content-security-policy']?.includes("connect-src 'self'"));

    // 2. /api/live without credentials -> 401
    const unauthRes = await dispatchRequest(srv, '/api/live');
    assert.equal(unauthRes.status, 401);

    // 3. Query string token must NOT authenticate
    const queryTokRes = await dispatchRequest(srv, `/api/live?token=${encodeURIComponent(token)}`);
    assert.equal(queryTokRes.status, 401);

    // 4. Bearer auth -> 200 sanitized snapshot
    const authRes = await dispatchRequest(srv, '/api/live', {
      headers: { Authorization: `Bearer ${token}` }
    });
    assert.equal(authRes.status, 200);
    const snap = JSON.parse(authRes.body);
    assert.equal(snap.activeConvId, convId);
    assert.ok(!authRes.body.includes('super_secret_999'), 'secret must never leak in HTTP JSON');

    // 5. Exchange Bearer -> HttpOnly Strict Cookie
    const cookieRes = await dispatchRequest(srv, '/api/auth-cookie', {
      headers: { Authorization: `Bearer ${token}` }
    });
    assert.equal(cookieRes.status, 200);
    const rawSetCookie = cookieRes.headers['set-cookie'];
    const setCookies = Array.isArray(rawSetCookie) ? rawSetCookie : [rawSetCookie].filter(Boolean);
    const authCookiePair = setCookies.find((c) => c.startsWith('mc_auth='));
    assert.ok(authCookiePair, 'mc_auth cookie must be set');
    assert.ok(authCookiePair.includes('HttpOnly'));
    assert.ok(authCookiePair.includes('SameSite=Strict'));
    const cookieHeader = authCookiePair.split(';')[0];

    // 6. Access /api/live via Cookie
    const cookieLiveRes = await dispatchRequest(srv, '/api/live', {
      headers: { Cookie: cookieHeader }
    });
    assert.equal(cookieLiveRes.status, 200);

    // 7. SSE /api/stream emits snapshot frame with valid Cookie
    const sseRes = await dispatchRequest(srv, '/api/stream', {
      headers: { Cookie: cookieHeader },
      streamMatch: (buf) => buf.includes('event: snapshot') && buf.includes(convId)
    });
    assert.equal(sseRes.status, 200);
    assert.ok(sseRes.headers['content-type']?.includes('text/event-stream'));
    assert.ok(sseRes.body.includes('event: snapshot'));

    // 8. Negative security probes
    const postRes = await dispatchRequest(srv, '/api/live', { method: 'POST' });
    assert.equal(postRes.status, 405);

    const traversalRes = await dispatchRequest(srv, '/../../etc/passwd', {
      headers: { Cookie: cookieHeader }
    });
    assert.equal(traversalRes.status, 404);

    const badConvRes = await dispatchRequest(srv, '/api/live?conv=../evil', {
      headers: { Cookie: cookieHeader }
    });
    assert.equal(badConvRes.status, 400);

    // 9. HEAD /api/auth-cookie returns empty body even without token
    const openSrv = createMissionControlServer({
      rootDir: REPO_ROOT,
      host: '127.0.0.1',
      port: 0,
      brainDir,
      token: ''
    });
    const headAuthRes = await dispatchRequest(openSrv, '/api/auth-cookie', { method: 'HEAD' });
    assert.equal(headAuthRes.status, 200);
    assert.equal(headAuthRes.body, '');
    await openSrv.stop();
  } finally {
    await srv.stop();
    fs.rmSync(brainDir, { recursive: true, force: true });
  }
});

test('readLiveSnapshot handles JSONL nulls/primitives, symlinks, and >256KB tail cleanly', () => {
  const brainDir = makeTempBrain('ag-mc-bound-');
  const outsideFile = path.join(os.tmpdir(), `outside-secret-${Date.now()}.jsonl`);
  fs.writeFileSync(outsideFile, '{"secret":"should_not_read"}\n', 'utf8');

  try {
    const convId = 'bbbbbbbb-1111-2222-3333-cccccccccccc';
    const nowIso = new Date().toISOString();
    const bigPad = 'X'.repeat(300 * 1024);
    writeConvFixture(brainDir, convId, [
      JSON.stringify({ step_index: 0, content: bigPad }),
      'null',
      '12345',
      '"raw-string"',
      { step_index: 1, type: 'PLANNER_RESPONSE', created_at: nowIso, tool_calls: [null, 'bad', { name: 'run_command', args: '{badjson' }] }
    ]);

    // Symlink inside another conv must be ignored safely
    const symConv = 'cccccccc-4444-5555-6666-dddddddddddd';
    const symLogs = path.join(brainDir, symConv, '.system_generated', 'logs');
    fs.mkdirSync(symLogs, { recursive: true });
    try {
      fs.symlinkSync(outsideFile, path.join(symLogs, 'transcript.jsonl'));
    } catch {
      // ignore on platforms restricting symlinks
    }

    const snap = readLiveSnapshot({ brainDir, convId });
    assert.equal(snap.activeConvId, convId);
    assert.ok(['working', 'inspecting'].includes(snap.agents.turing.status));
    assert.ok(!JSON.stringify(snap).includes('should_not_read'));
  } finally {
    fs.rmSync(brainDir, { recursive: true, force: true });
    fs.rmSync(outsideFile, { force: true });
  }
});

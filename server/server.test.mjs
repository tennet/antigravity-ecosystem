import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import http from 'node:http';
import vm from 'node:vm';
import { EventEmitter } from 'node:events';
import { fileURLToPath } from 'node:url';

import {
  CANONICAL_AGENTS,
  ALL_STATION_AGENTS,
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

test('readLiveSnapshot includes 12 canonical agents (@karpathy, @dpo, @mitnick), prevents parent->child hijack, and preserves subagent steps', () => {
  for (const requiredAgent of ['karpathy', 'dpo', 'mitnick', 'turing', 'linus', 'geohot']) {
    assert.ok(CANONICAL_AGENTS.includes(requiredAgent), `${requiredAgent} must be in CANONICAL_AGENTS`);
    assert.ok(ALL_STATION_AGENTS.includes(requiredAgent), `${requiredAgent} must be in ALL_STATION_AGENTS`);
  }
  assert.equal(CANONICAL_AGENTS.length, 12);

  const brainDir = makeTempBrain('ag-mc-substeps-');
  try {
    const parentId = '11111111-aaaa-bbbb-cccc-000000000001';
    const childMitnickId = '22222222-aaaa-bbbb-cccc-000000000002';
    const childNowIso = new Date().toISOString();
    const olderIso = new Date(Date.now() - 10_000).toISOString();

    writeConvFixture(brainDir, parentId, [
      {
        step_index: 1,
        source: 'MODEL',
        type: 'PLANNER_RESPONSE',
        status: 'DONE',
        created_at: olderIso,
        tool_calls: [
          {
            name: 'invoke_subagent',
            args: JSON.stringify({ TypeName: 'ethical-hacker-redteam', Role: 'Red Team Infra Probe with @linus' })
          }
        ]
      }
    ], {
      [childMitnickId]: {
        conversationId: childMitnickId,
        subagentDescriptor: { typeName: 'mitnick', role: 'Red Team Infra Probe' },
        state: 'SUBAGENT_STATE_ALIVE',
        spawnStepIndex: 1
      }
    });

    // Write MORE RECENT child subagent transcript with multiple intermediate steps
    writeConvFixture(brainDir, childMitnickId, [
      {
        step_index: 1,
        source: 'MODEL',
        type: 'PLANNER_RESPONSE',
        status: 'DONE',
        created_at: new Date(Date.now() - 5_000).toISOString(),
        tool_calls: [
          {
            name: 'read_file',
            args: JSON.stringify({ Path: '/Users/manuele/.gemini/antigravity/scratch/antigravity-ecosystem/infrastructure/docker-compose.yml' })
          }
        ]
      },
      {
        step_index: 2,
        source: 'MODEL',
        type: 'PLANNER_RESPONSE',
        status: 'DONE',
        created_at: childNowIso,
        tool_calls: [
          {
            name: 'run_command',
            args: JSON.stringify({ CommandLine: 'echo probe', toolSummary: 'Probe exposed ports and auth headers' })
          }
        ]
      }
    ]);

    // Auto-select MUST stay on parentId even when childMitnickId transcript is newer
    const snap = readLiveSnapshot({ brainDir });
    assert.equal(snap.activeConvId, parentId);
    assert.equal(snap.sessionStatus, 'active');
    assert.notEqual(snap.agents.mitnick.status, 'idle');
    assert.ok(snap.events.some((e) => e.actor === 'mitnick' && e.summary.includes('docker-compose.yml')), 'intermediate subagent read_file step must appear in events');
    assert.ok(snap.events.some((e) => e.actor === 'mitnick' && e.summary.includes('Probe exposed ports')), 'latest subagent step must appear in events');
  } finally {
    fs.rmSync(brainDir, { recursive: true, force: true });
  }
});

test('SSE /api/stream automatically pushes live snapshot updates without manual /api/live polling', async () => {
  const brainDir = makeTempBrain('ag-mc-sse-push-');
  const convId = '33333333-4444-5555-6666-777777777777';
  const t1 = new Date().toISOString();

  writeConvFixture(brainDir, convId, [
    {
      step_index: 1,
      source: 'MODEL',
      type: 'PLANNER_RESPONSE',
      status: 'DONE',
      created_at: t1,
      tool_calls: [
        { name: 'read_file', args: JSON.stringify({ Path: '/Users/manuele/.gemini/antigravity/scratch/antigravity-ecosystem/README.md' }) }
      ]
    }
  ]);

  const srv = createMissionControlServer({
    rootDir: REPO_ROOT,
    host: '127.0.0.1',
    port: 0,
    brainDir
  });

  try {
    let scheduledTrigger = false;
    const sseRes = await dispatchRequest(srv, '/api/stream', {
      streamMatch: (buf) => {
        if (!scheduledTrigger && buf.includes('event: snapshot') && buf.includes('README.md')) {
          scheduledTrigger = true;
          queueMicrotask(() => {
            const step2 = JSON.stringify({
              step_index: 2,
              source: 'MODEL',
              type: 'PLANNER_RESPONSE',
              status: 'DONE',
              created_at: new Date().toISOString(),
              tool_calls: [
                { name: 'invoke_subagent', args: JSON.stringify({ TypeName: 'mitnick', Role: 'Red Team Probe LIVE' }) }
              ]
            });
            fs.appendFileSync(
              path.join(brainDir, convId, '.system_generated', 'logs', 'transcript.jsonl'),
              `${step2}\n`,
              'utf8'
            );
            srv.pollNow(false);
          });
        }
        return buf.includes('Red Team Probe LIVE');
      }
    });

    assert.equal(sseRes.status, 200);
    assert.ok(sseRes.headers['content-type']?.includes('text/event-stream'));
    const snapshotFrames = sseRes.body.split('event: snapshot').length - 1;
    assert.ok(snapshotFrames >= 2, `Expected >=2 automatic SSE snapshot frames, got ${snapshotFrames}`);
    assert.ok(sseRes.body.includes('Red Team Probe LIVE'), 'pushed SSE frame must carry newly appended step');
  } finally {
    await srv.stop();
    fs.rmSync(brainDir, { recursive: true, force: true });
  }
});

test('readLiveSnapshot transitions finished turn & replied SUBAGENT_STATE_ALIVE subagents cleanly to approved -> idle', () => {
  const brainDir = makeTempBrain('ag-mc-lifecycle-');
  try {
    const convId = '44444444-aaaa-bbbb-cccc-000000000001';
    const steveChildId = '55555555-aaaa-bbbb-cccc-000000000002';
    const baseMs = Date.UTC(2026, 10, 12, 13, 0, 0);

    // Phase A: Coordinator waiting on active image-generator (@steve) subagent
    writeConvFixture(brainDir, convId, [
      {
        step_index: 1,
        source: 'MODEL',
        type: 'PLANNER_RESPONSE',
        status: 'DONE',
        created_at: new Date(baseMs).toISOString(),
        tool_calls: [
          { name: 'invoke_subagent', args: JSON.stringify({ TypeName: 'image-generator', Role: 'Mockup UI Bento' }) }
        ]
      },
      {
        step_index: 2,
        source: 'MODEL',
        type: 'GENERIC',
        status: 'DONE',
        created_at: new Date(baseMs + 500).toISOString(),
        content: 'Created subagent'
      },
      {
        step_index: 3,
        source: 'MODEL',
        type: 'PLANNER_RESPONSE',
        status: 'DONE',
        created_at: new Date(baseMs + 1000).toISOString(),
        tool_calls: [],
        content: 'Avvio generazione mockup in background.'
      }
    ], {
      [steveChildId]: {
        conversationId: steveChildId,
        subagentDescriptor: { typeName: 'image-generator', role: 'Mockup UI Bento' },
        state: 'SUBAGENT_STATE_ALIVE',
        spawnStepIndex: 1
      }
    });

    const snapWhileRunning = readLiveSnapshot({ brainDir, convId, nowMs: baseMs + 5000 });
    assert.equal(snapWhileRunning.agents.steve.status, 'working', 'image-generator should map to @steve working while active');
    assert.equal(snapWhileRunning.agents.turing.status, 'reviewing', '@turing should show reviewing while waiting for active subagents');
    assert.equal(snapWhileRunning.currentPhase, 3);
    assert.ok(snapWhileRunning.transfers.some((tr) => tr.from === 'turing' && tr.to === 'steve' && tr.active === true && typeof tr.id === 'string'));

    // Phase A2: Long-running subagent still thinking > 45s (e.g. 3 minutes) without reply yet must stay active (not freeze to idle)
    const snapLongThink = readLiveSnapshot({ brainDir, convId, nowMs: baseMs + 180_000 });
    assert.equal(snapLongThink.agents.steve.status, 'working', 'Long-running SUBAGENT_STATE_ALIVE @steve must stay working past 45s while no reply arrived');
    assert.equal(snapLongThink.agents.turing.status, 'reviewing', '@turing must stay reviewing while long-running @steve subagent works');

    // Phase B: Child ran read_file, then replied with [APPROVATO] SYSTEM_MESSAGE, then @turing delivered final response
    writeConvFixture(brainDir, steveChildId, [
      {
        step_index: 1,
        source: 'MODEL',
        type: 'PLANNER_RESPONSE',
        status: 'DONE',
        created_at: new Date(baseMs + 6000).toISOString(),
        tool_calls: [{ name: 'read_file', args: JSON.stringify({ Path: '/Users/manuele/docs/mission_control.html' }) }]
      },
      {
        step_index: 2,
        source: 'MODEL',
        type: 'PLANNER_RESPONSE',
        status: 'DONE',
        created_at: new Date(baseMs + 7000).toISOString(),
        tool_calls: [],
        content: 'Mockup pronto.'
      }
    ]);

    writeConvFixture(brainDir, convId, [
      {
        step_index: 1,
        source: 'MODEL',
        type: 'PLANNER_RESPONSE',
        status: 'DONE',
        created_at: new Date(baseMs).toISOString(),
        tool_calls: [
          { name: 'invoke_subagent', args: JSON.stringify({ TypeName: 'image-generator', Role: 'Mockup UI Bento' }) }
        ]
      },
      {
        step_index: 2,
        source: 'SYSTEM',
        type: 'SYSTEM_MESSAGE',
        status: 'DONE',
        created_at: new Date(baseMs + 7200).toISOString(),
        content: `[Message] sender=${steveChildId} content=[APPROVATO] Mockup completato`
      },
      {
        step_index: 3,
        source: 'MODEL',
        type: 'PLANNER_RESPONSE',
        status: 'DONE',
        created_at: new Date(baseMs + 8000).toISOString(),
        tool_calls: [],
        content: 'Ecco i mockup pronti, quale scegli?'
      }
    ], {
      [steveChildId]: {
        conversationId: steveChildId,
        subagentDescriptor: { typeName: 'image-generator', role: 'Mockup UI Bento' },
        state: 'SUBAGENT_STATE_ALIVE',
        spawnStepIndex: 1
      }
    });

    const snapAckWindow = readLiveSnapshot({ brainDir, convId, nowMs: baseMs + 12000 });
    assert.equal(snapAckWindow.agents.steve.status, 'approved', 'Replied subagent must NOT revert to inspecting even with SUBAGENT_STATE_ALIVE');
    assert.equal(snapAckWindow.agents.turing.status, 'approved', 'Final PLANNER_RESPONSE without running subagents must be approved, not typing/working');

    const snapAfterCooldown = readLiveSnapshot({ brainDir, convId, nowMs: baseMs + 30000 });
    assert.equal(snapAfterCooldown.agents.steve.status, 'idle', 'Subagent should return to idle after ack cooldown');
    assert.equal(snapAfterCooldown.agents.turing.status, 'idle', 'Coordinator waiting for user must return to idle after ack cooldown');
    assert.equal(snapAfterCooldown.sessionStatus, 'idle');
    assert.equal(snapAfterCooldown.currentPhase, 0);
  } finally {
    fs.rmSync(brainDir, { recursive: true, force: true });
  }
});

test('mission_control.html satisfies offline zero-CDN, CSP SHA-256 hash, zero-innerHTML and DOM invariants', () => {
  const htmlPath = path.join(REPO_ROOT, 'docs', 'mission_control.html');
  const html = fs.readFileSync(htmlPath, 'utf8');

  const cspMatch = html.match(/<meta\s+http-equiv="Content-Security-Policy"\s+content="([^"]+)"/i);
  assert.ok(cspMatch, 'CSP meta tag must exist');
  const hashMatch = cspMatch[1].match(/script-src\s+'sha256-([^']+)'/);
  assert.ok(hashMatch, 'CSP script-src must declare a sha256 hash');

  const scriptMatch = html.match(/<script>([\s\S]*?)<\/script>/);
  assert.ok(scriptMatch, 'Inline script must exist');
  const computedHash = crypto.createHash('sha256').update(scriptMatch[1], 'utf8').digest('base64');
  assert.equal(hashMatch[1], computedHash, 'CSP sha256 hash must match inline script verbatim');

  assert.doesNotMatch(html, /\.(?:innerHTML|outerHTML)\s*=|\.insertAdjacentHTML\s*\(/, 'Must never use unsafe HTML sinks');
  assert.doesNotMatch(html, /https?:\/\/(?:cdn|fonts\.googleapis|unpkg\.com|jsdelivr)/i, 'Must contain zero external CDN URLs');

  const markupOnly = html.slice(0, scriptMatch.index);
  assert.doesNotMatch(markupOnly, /\son(?:click|change|input|mouseover|mouseout|keydown|keyup|load|error)=/i, 'Markup must not contain inline on* handlers');
  assert.match(html, /\.hidden\s*\{\s*display:\s*none/i, '.hidden utility must exist');
  assert.match(html, /#officeLiveStatusBar\.hidden\s*\{\s*display:\s*none;?\s*\}/, 'Dynamic elements must keep .hidden precedence over flex/grid utilities');

  const requiredIds = [
    'topConnDot', 'topConnPing', 'topConnModeBadge', 'topStatusSummary',
    'officeSvg', 'officeSpeechLayer', 'officeHoverCard', 'officeProgressBar',
    'officeLogFeed', 'officeLogCount', 'officeModeLiveBtn', 'officeModeDemoBtn',
    'officeLiveStatusBar', 'officeAuthPanel', 'officeTokenInput', 'officeFeniceToggleBtn',
    'spotIconBox', 'spotName', 'spotAlias', 'leftFeniceNav'
  ];
  for (const id of requiredIds) {
    assert.ok(html.includes(`id="${id}"`), `Required DOM element id="${id}" missing`);
  }
});

test('mission_control.html inline UI script executes renderIsometricOffice + applyLiveSnapshot cleanly in mock DOM', () => {
  const html = fs.readFileSync(path.join(REPO_ROOT, 'docs', 'mission_control.html'), 'utf8');
  const scriptMatch = html.match(/<script>([\s\S]*?)<\/script>/);
  assert.ok(scriptMatch);

  const elementsById = new Map();
  function makeMockClassList(el) {
    return {
      contains: (c) => el._classes.has(c),
      add: (...cs) => { cs.forEach((c) => c && el._classes.add(c)); },
      remove: (...cs) => { cs.forEach((c) => el._classes.delete(c)); },
      toggle: (c, force) => {
        if (force === true) { el._classes.add(c); return true; }
        if (force === false) { el._classes.delete(c); return false; }
        if (el._classes.has(c)) { el._classes.delete(c); return false; }
        el._classes.add(c);
        return true;
      }
    };
  }
  function createMockEl(tag, initialId = null) {
    const el = {
      tagName: tag.toUpperCase(),
      id: initialId || '',
      children: [],
      parentNode: null,
      style: {},
      dataset: {},
      _attrs: new Map(),
      _classes: new Set(),
      _listeners: new Map(),
      _text: '',
      value: '',
      type: '',
      clientWidth: 1200,
      clientHeight: 760,
      offsetWidth: 300,
      offsetHeight: 240,
      get textContent() { return this._text; },
      set textContent(v) { this._text = String(v ?? ''); },
      get className() { return Array.from(this._classes).join(' '); },
      set className(v) {
        this._classes = new Set(String(v || '').split(/\s+/).filter(Boolean));
      },
      setAttribute(k, v) {
        const val = String(v);
        this._attrs.set(k, val);
        if (k === 'id') {
          this.id = val;
          elementsById.set(val, this);
        } else if (k === 'class') {
          this.className = val;
        } else if (k.startsWith('data-')) {
          const camel = k.slice(5).replace(/-([a-z])/g, (_, ch) => ch.toUpperCase());
          this.dataset[camel] = val;
        }
      },
      getAttribute(k) {
        if (k === 'id') return this.id;
        return this._attrs.get(k) ?? null;
      },
      appendChild(child) {
        if (child) {
          child.parentNode = this;
          this.children.push(child);
        }
        return child;
      },
      removeChild(child) {
        this.children = this.children.filter((c) => c !== child);
        if (child) child.parentNode = null;
        return child;
      },
      remove() {
        if (this.parentNode) this.parentNode.removeChild(this);
      },
      prepend(child) {
        if (child) {
          child.parentNode = this;
          this.children.unshift(child);
        }
      },
      replaceChildren(...nodes) {
        this.children = [];
        for (const n of nodes) this.appendChild(n);
      },
      querySelector() { return createMockEl('span'); },
      querySelectorAll() { return []; },
      closest() { return null; },
      contains() { return false; },
      addEventListener(ev, fn) {
        const arr = this._listeners.get(ev) || [];
        arr.push(fn);
        this._listeners.set(ev, arr);
      }
    };
    el.classList = makeMockClassList(el);
    if (initialId) elementsById.set(initialId, el);
    return el;
  }

  for (const id of [
    'topConnDot', 'topConnPing', 'topConnModeBadge', 'topStatusSummary',
    'officeSvg', 'officeSpeechLayer', 'officeHoverCard', 'officeProgressBar',
    'officeLogFeed', 'officeLogCount', 'officeModeLiveBtn', 'officeModeDemoBtn',
    'officeLiveStatusBar', 'officeAuthPanel', 'officeAuthError', 'officeTokenInput',
    'officeFeniceToggleBtn', 'officeFeniceStateBadge', 'officeFeniceStrip', 'officeFeniceStripCards',
    'officeStageHeadline', 'officeStepCounter', 'officeStepPhaseTag', 'officeScrubberDots',
    'officeLivePing', 'officeLiveIndicator', 'officeLiveStatusBanner', 'officeLiveStatusText',
    'officeLiveWorkspaceBadge', 'officeLiveTimestampBadge', 'officeViewport', 'officeLiveStateBadge',
    'spotIconBox', 'spotName', 'spotAlias', 'spotRole', 'spotWhat', 'spotHow', 'spotCanon',
    'spotExperience', 'spotSkills', 'spotRedLine', 'spotStatusPill',
    'leftFeniceNav', 'leftSpecialistsNav', 'teamGrid', 'tab-office', 'tab-cockpit',
    'promptPreview', 'taskInput', 'agentCountPill', 'promptAgentChip'
  ]) {
    createMockEl('div', id);
  }

  const domListeners = {};
  const mockDoc = {
    body: createMockEl('body'),
    getElementById: (id) => elementsById.get(id) || createMockEl('div', id),
    querySelectorAll: () => [],
    querySelector: () => null,
    createElement: (tag) => createMockEl(tag),
    createElementNS: (_ns, tag) => createMockEl(tag),
    createTextNode: (txt) => ({ nodeType: 3, textContent: String(txt) }),
    addEventListener: () => {}
  };
  const winListeners = {};
  const sandbox = {
    window: {
      location: { protocol: 'http:', host: '127.0.0.1:8787', hash: '' },
      addEventListener: (ev, fn) => { winListeners[ev] = fn; },
      matchMedia: () => ({ matches: false })
    },
    document: mockDoc,
    navigator: { clipboard: { writeText: async () => {} } },
    performance: { now: () => 1000 },
    requestAnimationFrame: () => 1,
    cancelAnimationFrame: () => {},
    setTimeout,
    clearTimeout,
    setInterval: () => 1,
    clearInterval: () => {},
    fetch: async () => ({ status: 200, ok: true, json: async () => ({}) }),
    console
  };
  sandbox.globalThis = sandbox;
  sandbox.window.document = mockDoc;

  vm.createContext(sandbox);
  vm.runInContext(scriptMatch[1], sandbox);
  sandbox.renderIsometricOffice();

  const svg = elementsById.get('officeSvg');
  const layerIds = svg.children.map((c) => c.id);
  const underlayIdx = layerIds.indexOf('fenice-underlay-group');
  const stationsIdx = layerIds.indexOf('office-stations-layer');
  assert.ok(underlayIdx >= 0 && stationsIdx > underlayIdx, '#fenice-underlay-group must render before #office-stations-layer');

  const fakeSnap = {
    activeConvId: 'abcdef12-3456-4789-abcd-ef0123456789',
    sessionStatus: 'active',
    workspaceName: 'antigravity-ecosystem',
    currentPhase: 3,
    phoenix: { active: true },
    agents: {
      turing: { status: 'reviewing', task: 'Coordina deploy' },
      geohot: { status: 'veto', task: 'Verifica CSP' },
      steve: { status: 'working', task: 'Obsidian UI' },
      carmack: { status: 'working', task: 'Test boundary' },
      linus: { status: 'working', task: 'Server config' },
      rauch: { status: 'inspecting', task: 'E2E checks' },
      pacioli: { status: 'working', task: 'Fiscale check' }
    },
    transfers: [
      { id: 'tr-1', from: 'turing', to: 'steve', label: 'UI', tone: '#8b5cf6', active: true }
    ],
    events: [
      { id: 'ev-1', actor: '@steve', tag: '[UI]', tone: 'purple', timestamp: new Date().toISOString(), summary: 'Refactored Obsidian theme' }
    ]
  };

  sandbox.applyLiveSnapshot(fakeSnap);
  assert.ok(elementsById.get('officeSpeechLayer').children.length <= 5, 'Live speech bubbles must be capped at <= 5');
  assert.equal(elementsById.get('officeProgressBar').style.transform, 'scaleX(1.0000)');
  assert.ok(!elementsById.get('fenice-room-group').classList.contains('hidden'), 'Fenice room must open when pacioli/phoenix active');
});

test('Server enforces loopback Host header (403), auth brute-force rate limit (429), HEAD /api/stream, depth-2 subagents and real TCP lifecycle', async () => {
  const brainDir = makeTempBrain();
  const baseMs = 1_700_000_000_000;
  const rootId = '11111111-1111-4111-8111-111111111111';
  const childId = '22222222-2222-4222-8222-222222222222';
  const grandId = '33333333-3333-4333-8333-333333333333';

  try {
    writeConvFixture(brainDir, grandId, [
      { step_index: 1, source: 'MODEL', type: 'PLANNER_RESPONSE', status: 'DONE', created_at: new Date(baseMs + 5000).toISOString(), tool_calls: [{ name: 'run_command', args: JSON.stringify({ CommandLine: 'pytest' }) }] }
    ]);
    writeConvFixture(brainDir, childId, [
      { step_index: 1, source: 'MODEL', type: 'PLANNER_RESPONSE', status: 'DONE', created_at: new Date(baseMs + 3000).toISOString(), tool_calls: [{ name: 'invoke_subagent', args: JSON.stringify({ TypeName: 'carmack', Role: 'Test depth 2' }) }] }
    ], {
      [grandId]: { conversationId: grandId, subagentDescriptor: { typeName: 'carmack', role: 'Test depth 2' }, state: 'SUBAGENT_STATE_ALIVE' }
    });
    writeConvFixture(brainDir, rootId, [
      { step_index: 1, source: 'MODEL', type: 'PLANNER_RESPONSE', status: 'DONE', created_at: new Date(baseMs + 2000).toISOString(), tool_calls: [{ name: 'invoke_subagent', args: JSON.stringify({ TypeName: 'steve', Role: 'UI Master' }) }] },
      { step_index: 2, source: 'MODEL', type: 'PLANNER_RESPONSE', status: 'DONE', created_at: new Date(baseMs + 999_999_999).toISOString(), tool_calls: [] }
    ], {
      [childId]: { conversationId: childId, subagentDescriptor: { typeName: 'steve', role: 'UI Master' }, state: 'SUBAGENT_STATE_ALIVE' }
    });

    // Future timestamps (> nowMs + 60s) must clamp and NaN nowMs must fall back cleanly
    const snapDepth2 = readLiveSnapshot({ brainDir, convId: rootId, nowMs: Number.NaN });
    assert.ok(snapDepth2.agents.steve, 'Depth-1 steve mapped');
    assert.ok(snapDepth2.agents.carmack, 'Depth-2 carmack nested subagent mapped');

    const snapClamped = readLiveSnapshot({ brainDir, convId: rootId, nowMs: baseMs + 6000 });
    assert.equal(snapClamped.agents.carmack.status, 'working', 'Depth-2 carmack must be active despite future parent timestamp being ignored/clamped');

    const loopbackSrv = createMissionControlServer({ host: '127.0.0.1', port: 0, brainDir });
    const dnsRebindRes = await dispatchRequest(loopbackSrv, '/api/live', {
      headers: { host: 'evil.attacker.com:8787' }
    });
    assert.equal(dnsRebindRes.status, 403, 'Disallowed Host header on loopback must return 403');

    const headStreamRes = await dispatchRequest(loopbackSrv, '/api/stream', {
      method: 'HEAD',
      headers: { host: '127.0.0.1:8787' }
    });
    assert.equal(headStreamRes.status, 200);
    assert.match(headStreamRes.headers['content-type'], /^text\/event-stream/);
    assert.equal(headStreamRes.body, '');

    const lanToken = 'test-lan-token-at-least-16-chars';
    const lanSrv = createMissionControlServer({ host: '0.0.0.0', port: 0, authToken: lanToken, brainDir });
    let lastStatus = 0;
    for (let i = 0; i < 12; i++) {
      const attempt = await dispatchRequest(lanSrv, '/api/auth-cookie', {
        headers: { authorization: 'Bearer wrong-token-00000000' },
        remoteAddress: '192.168.1.99'
      });
      lastStatus = attempt.status;
    }
    assert.equal(lastStatus, 429, 'Repeated failed auth attempts must trigger 429 rate limit');

    // Real loopback HTTP server bind + clean shutdown smoke check
    const started = await loopbackSrv.start();
    try {
      assert.ok(Number.isInteger(started.port) && started.port > 0, 'Loopback server must bind an ephemeral port cleanly');
      const liveViaDispatch = await dispatchRequest(loopbackSrv, '/healthz', {
        headers: { host: `127.0.0.1:${started.port}` }
      });
      assert.equal(liveViaDispatch.status, 200);
      assert.equal(JSON.parse(liveViaDispatch.body).status, 'ok');
    } finally {
      await loopbackSrv.stop();
    }
  } finally {
    fs.rmSync(brainDir, { recursive: true, force: true });
  }
});

test('mission_control_server exposes production RFC health check, enhanced security headers, and socket timeouts', async () => {
  const srv = createMissionControlServer({ host: '127.0.0.1', port: 0 });
  assert.equal(srv.server.requestTimeout, 15_000, 'Must configure requestTimeout to 15s');
  assert.equal(srv.server.headersTimeout, 10_000, 'Must configure headersTimeout to 10s');
  assert.equal(srv.server.keepAliveTimeout, 5_000, 'Must configure keepAliveTimeout to 5s');
  assert.equal(srv.server.maxHeadersCount, 100, 'Must limit maxHeadersCount to 100');

  const res = await dispatchRequest(srv, '/healthz', {
    headers: { host: '127.0.0.1:8787' }
  });
  assert.equal(res.status, 200);
  assert.equal(res.headers['x-content-type-options'], 'nosniff');
  assert.equal(res.headers['x-frame-options'], 'DENY');
  assert.equal(res.headers['referrer-policy'], 'no-referrer');
  assert.equal(res.headers['cross-origin-opener-policy'], 'same-origin');
  assert.ok(res.headers['permissions-policy']);

  const parsed = JSON.parse(res.body);
  assert.equal(parsed.status, 'ok');
  assert.equal(parsed.health, 'pass');
  assert.equal(parsed.version, 'v4.1.0');
  assert.ok(typeof parsed.uptime_s === 'number');
  assert.ok(typeof parsed.sse_clients === 'number');
  assert.ok(typeof parsed.memory_rss_mb === 'number');
  assert.ok(typeof parsed.brain_readable === 'boolean');
});

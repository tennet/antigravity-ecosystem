import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import {
  createMissionControlStudioServer,
  scanSkillsCatalog,
  readDirectivesFile
} from './mission_control_studio_server.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function makeTempDir(prefix = 'studio-test-') {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function safeParse(str) {
  try { return JSON.parse(str); } catch { return null; }
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
    };
    res.write = (chunk) => {
      const str = Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk);
      chunks.push(str);
      const joined = chunks.join('');
      if (options.streamMatch && options.streamMatch(joined)) {
        req.emit('close');
        resolve({ status: res.statusCode, headers: hdrs, body: joined, json: safeParse(joined) });
      }
      return true;
    };
    res.end = (chunk = '') => {
      if (chunk) chunks.push(Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk));
      const body = chunks.join('');
      resolve({ status: res.statusCode, headers: hdrs, body, json: safeParse(body) });
    };

    srv.dispatch(req, res);

    if (options.body) {
      const payload = typeof options.body === 'object' ? JSON.stringify(options.body) : String(options.body);
      req.emit('data', Buffer.from(payload, 'utf8'));
    }
    req.emit('end');
  });
}

test('studio_server: health check and basic catalog scanning', async () => {
  const tmpDir = makeTempDir();
  const testSkillsDir = path.join(tmpDir, 'skills');
  fs.mkdirSync(path.join(testSkillsDir, 'test-skill'), { recursive: true });
  fs.writeFileSync(
    path.join(testSkillsDir, 'test-skill', 'SKILL.md'),
    '---\nname: test-skill\ndescription: Test description\n---\n# Test Title\nContent here',
    'utf8'
  );

  const testDirectives = path.join(tmpDir, 'directives', 'queue.json');

  const srv = createMissionControlStudioServer({
    rootDir: tmpDir,
    skillsDir: testSkillsDir,
    directivesPath: testDirectives,
    referencesDir: path.join(__dirname, '..', 'portable', 'engineering-team', 'references'),
    agentsDir: path.join(__dirname, '..', 'portable', 'engineering-team', 'agents'),
    host: '127.0.0.1',
    port: 0
  });

  try {
    // 1. Check /healthz
    const hRes = await dispatchRequest(srv, '/healthz');
    assert.equal(hRes.status, 200);
    assert.equal(hRes.json.edition, 'Antigravity Live Studio (Parallel)');
    assert.equal(hRes.json.skills_count, 1);
    assert.equal(hRes.json.directives_count, 0);

    // 2. Check GET /api/skills
    const sRes = await dispatchRequest(srv, '/api/skills');
    assert.equal(sRes.status, 200);
    assert.equal(sRes.json.total, 1);
    assert.equal(sRes.json.skills[0].name, 'test-skill');

    // 3. Check GET /api/skills?name=test-skill
    const singleRes = await dispatchRequest(srv, '/api/skills?name=test-skill');
    assert.equal(singleRes.status, 200);
    assert.equal(singleRes.json.name, 'test-skill');
    assert.match(singleRes.json.content, /# Test Title/);

    // 4. Check CSRF protection on POST (must require X-Requested-With)
    const csrfFail = await dispatchRequest(srv, '/api/skills', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: { name: 'forbidden-skill', content: 'test' }
    });
    assert.equal(csrfFail.status, 403, 'Must reject POST without X-Requested-With');

    // 5. Check valid POST /api/skills
    const postSkillRes = await dispatchRequest(srv, '/api/skills', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Requested-With': 'Antigravity-MissionControl'
      },
      body: {
        name: 'new-agent-skill',
        description: 'Skill creata dal monitor per il team',
        content: '# Nuova Skill\nIstruzioni operative avanzate'
      }
    });
    assert.equal(postSkillRes.status, 200);
    assert.equal(postSkillRes.json.success, true);

    const savedFile = path.join(testSkillsDir, 'new-agent-skill', 'SKILL.md');
    assert.ok(fs.existsSync(savedFile));
    const savedContent = fs.readFileSync(savedFile, 'utf8');
    assert.match(savedContent, /name: new-agent-skill/);
    assert.match(savedContent, /# Nuova Skill/);

    // 6. Check Path-Traversal rejection
    const traversalRes = await dispatchRequest(srv, '/api/skills', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Requested-With': 'Antigravity-MissionControl'
      },
      body: {
        name: '../../escape',
        description: 'Hacker skill',
        content: 'evil'
      }
    });
    assert.equal(traversalRes.status, 400, 'Must block path traversal characters');

    // 7. Check Directives Workflow
    const dirGetRes = await dispatchRequest(srv, '/api/directives');
    assert.equal(dirGetRes.status, 200);
    assert.equal(dirGetRes.json.total, 0);

    const dirPostRes = await dispatchRequest(srv, '/api/directives', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Requested-With': 'Antigravity-MissionControl'
      },
      body: {
        targetAgent: 'linus',
        title: 'Hardening Nginx SSE',
        directive: 'Verificare buffer SSE proxy_buffering off sulla porta 8788',
        priority: 'high'
      }
    });
    assert.equal(dirPostRes.status, 200);
    assert.equal(dirPostRes.json.success, true);
    assert.equal(dirPostRes.json.directive.targetAgent, 'linus');
    assert.equal(dirPostRes.json.directive.priority, 'high');
    assert.match(dirPostRes.json.directive.antigravityPrompt, /@linus \[PRIORITÀ ALTA\]/);

    const dirId = dirPostRes.json.directive.id;

    // 8. Resolve Directive
    const resolveRes = await dispatchRequest(srv, '/api/directives/status', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Requested-With': 'Antigravity-MissionControl'
      },
      body: {
        id: dirId,
        status: 'completed'
      }
    });
    assert.equal(resolveRes.status, 200);
    assert.equal(resolveRes.json.directive.status, 'completed');

    // 9. Check /api/references and /api/agent-prompt
    const refListRes = await dispatchRequest(srv, '/api/references');
    assert.equal(refListRes.status, 200);
    assert.equal(refListRes.json.total, 12);

    const refSteveRes = await dispatchRequest(srv, '/api/references?agent=steve');
    assert.equal(refSteveRes.status, 200);
    assert.equal(refSteveRes.json.filename, '04_ui_ux_design_canon.md');
    assert.ok(refSteveRes.json.content.length > 100);

    const promptSteveRes = await dispatchRequest(srv, '/api/agent-prompt?agent=steve');
    assert.equal(promptSteveRes.status, 200);
    assert.equal(promptSteveRes.json.filename, 'ui-ux-designer.md');
    assert.ok(promptSteveRes.json.content.length > 100);

    // 10. Check /api/roster (dynamic discovery) and /api/triage
    const rosterRes = await dispatchRequest(srv, '/api/roster');
    assert.equal(rosterRes.status, 200);
    assert.ok(rosterRes.json.count >= 12);
    assert.ok(rosterRes.json.roster.steve);

    const triageRes = await dispatchRequest(srv, '/api/triage', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Requested-With': 'Antigravity-MissionControl'
      },
      body: { request: 'la porta del server su linux è occupata da un container' }
    });
    assert.equal(triageRes.status, 200);
    assert.equal(triageRes.json.triage.primarySpecialist.agentKey, 'linus');

  } finally {
    await srv?.stop?.();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('mission_control_studio.html satisfies offline zero-CDN, CSP SHA-256 hash, and zero-innerHTML', () => {
  const htmlPath = path.join(__dirname, '..', 'docs', 'mission_control_studio.html');
  assert.ok(fs.existsSync(htmlPath), 'mission_control_studio.html must exist');
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

  // Verify JavaScript parses cleanly with zero syntax errors
  assert.doesNotThrow(() => {
    new vm.Script(scriptMatch[1]);
  }, 'Inline JavaScript must be syntactically valid');
});

test('mission_control_studio.html inline UI script executes renderIsometricOffice + anatomy views cleanly in mock DOM', () => {
  const htmlPath = path.join(__dirname, '..', 'docs', 'mission_control_studio.html');
  const html = fs.readFileSync(htmlPath, 'utf8');
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
      querySelector(sel) {
        if (sel && sel.startsWith('#')) return elementsById.get(sel.slice(1)) || null;
        return createMockEl('span');
      },
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

  const idMatches = html.matchAll(/id=\"([^\"]+)\"/g);
  for (const m of idMatches) {
    createMockEl('div', m[1]);
  }

  const windowListeners = new Map();
  const docListeners = new Map();

  const mockWindow = {
    location: { protocol: 'http:', origin: 'http://127.0.0.1:8788', hash: '', pathname: '/' },
    addEventListener: (ev, fn) => {
      const arr = windowListeners.get(ev) || [];
      arr.push(fn);
      windowListeners.set(ev, arr);
    },
    removeEventListener: () => {},
    fetch: async () => ({ ok: true, json: async () => ({ skills: [], directives: [] }) }),
    document: {
      getElementById: (id) => elementsById.get(id) || null,
      createElement: (tag) => createMockEl(tag),
      createElementNS: (ns, tag) => createMockEl(tag),
      createTextNode: (t) => {
        const node = createMockEl('span');
        node.textContent = t;
        return node;
      },
      querySelector: (sel) => {
        if (sel && sel.startsWith('#')) return elementsById.get(sel.slice(1)) || null;
        return createMockEl('div');
      },
      querySelectorAll: () => [],
      addEventListener: (ev, fn) => {
        const arr = docListeners.get(ev) || [];
        arr.push(fn);
        docListeners.set(ev, arr);
      }
    },
    console,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval
  };
  mockWindow.window = mockWindow;
  mockWindow.document.defaultView = mockWindow;

  const sandbox = vm.createContext(mockWindow);
  vm.runInContext(scriptMatch[1], sandbox);

  const domHandlers = windowListeners.get('DOMContentLoaded') || [];
  assert.ok(domHandlers.length >= 1, 'DOMContentLoaded listener must be registered');
  for (const h of domHandlers) {
    h();
  }

  const officeSvg = elementsById.get('officeSvg');
  assert.ok(officeSvg && officeSvg.children.length > 0, 'officeSvg must be rendered with isometric desks');

  const spotWhat = elementsById.get('spotWhat');
  assert.ok(spotWhat && spotWhat.textContent.length > 10, 'spotWhat must be populated with agent spec');
});

test('studio_server: live monitoring feed captures thinking, tool calls, and SSE snapshot frames', async () => {
  const tmpDir = makeTempDir('studio-live-');
  const brainDir = path.join(tmpDir, 'brain');
  const convId = '88888888-7777-6666-5555-444444444444';
  const logsDir = path.join(brainDir, convId, '.system_generated', 'logs');
  fs.mkdirSync(logsDir, { recursive: true });

  const nowIso = new Date().toISOString();
  const transcriptLines = [
    JSON.stringify({
      step_index: 1,
      source: 'USER_EXPLICIT',
      type: 'USER_INPUT',
      created_at: nowIso,
      content: 'Implementare Cockpit Bidirezionale su porta 8788'
    }),
    JSON.stringify({
      step_index: 2,
      source: 'MODEL',
      type: 'PLANNER_RESPONSE',
      status: 'DONE',
      created_at: nowIso,
      thinking: 'Analizzo i requisiti: servono endpoint /api/skills e /api/directives, e stream live.',
      tool_calls: [
        {
          name: 'read_file',
          args: JSON.stringify({ Path: '/workspace/server/mission_control_studio_server.mjs' })
        }
      ]
    })
  ].join('\n');

  fs.writeFileSync(path.join(logsDir, 'transcript.jsonl'), transcriptLines, 'utf8');

  const srv = createMissionControlStudioServer({
    rootDir: tmpDir,
    brainDir,
    host: '127.0.0.1',
    port: 0
  });

  try {
    // 1. Fetch /api/live with specific conv
    const liveRes = await dispatchRequest(srv, `/api/live?conv=${convId}`);
    assert.equal(liveRes.status, 200);
    assert.equal(liveRes.json.activeConvId, convId);
    assert.equal(liveRes.json.sessionStatus, 'active');
    assert.ok(liveRes.json.events.length >= 2, 'Events must include prompt, thinking, and tool call');

    const thinkingEvent = liveRes.json.events.find(e => e.eventType === 'thinking');
    assert.ok(thinkingEvent, 'Must emit thinking event');
    assert.match(thinkingEvent.summary, /Analizzo i requisiti/);

    const toolEvent = liveRes.json.events.find(e => e.toolName === 'read_file');
    assert.ok(toolEvent, 'Must emit tool event');
    assert.equal(toolEvent.actor, 'turing');

    // 2. Stream SSE snapshot verification
    const sseRes = await dispatchRequest(srv, '/api/stream', {
      streamMatch: (buf) => buf.includes('event: snapshot') && buf.includes(convId)
    });
    assert.equal(sseRes.status, 200);
    assert.ok(sseRes.headers['content-type']?.includes('text/event-stream'));
    assert.ok(sseRes.body.includes('event: snapshot'));
    assert.ok(sseRes.body.includes(convId));
  } finally {
    await srv?.stop?.();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

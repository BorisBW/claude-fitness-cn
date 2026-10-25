#!/usr/bin/env node
// Coach Paddy graphical setup.
//
//   npm run setup        (or: node setup/server.mjs)
//
// Starts a tiny local web server, opens a form in your browser, and when you
// submit it: installs the skill, writes ~/.claude/fitness-coach/config.json,
// creates your data folder with the three memory files, and shows the one
// `claude mcp add` command you still have to run yourself.
//
// Zero dependencies. Never overwrites an existing memory file. Everything it
// writes is listed on the result page.

import http from 'node:http';
import { readFileSync, writeFileSync, mkdirSync, existsSync, copyFileSync, chmodSync } from 'node:fs';
import { join, dirname, resolve, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir, platform } from 'node:os';
import { spawn, spawnSync } from 'node:child_process';
import { generateFiles } from './generate.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const HOME = homedir();
const CONF_DIR = join(HOME, '.claude', 'fitness-coach');
const CONF_FILE = join(CONF_DIR, 'config.json');
const SECRETS_FILE = join(CONF_DIR, 'secrets.json');
const SKILLS_DIR = join(HOME, '.claude', 'skills');
const IS_WIN = platform() === 'win32';

// ---------- environment detection (read-only) ----------

function has(cmd) {
  const r = spawnSync(IS_WIN ? 'where' : 'which', [cmd], { encoding: 'utf8', windowsHide: true });
  return r.status === 0;
}

function existingMcpServers() {
  try {
    const j = JSON.parse(readFileSync(join(HOME, '.claude.json'), 'utf8'));
    return Object.keys(j.mcpServers || {});
  } catch {
    return [];
  }
}

function readJson(p) {
  try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return null; }
}

function status() {
  return {
    home: HOME,
    platform: platform(),
    node: process.version,
    defaultDataDir: join(HOME, 'Fitness'),
    config: readJson(CONF_FILE),
    hasSecrets: existsSync(SECRETS_FILE),
    hasClaude: has('claude'),
    hasUvx: has('uvx'),
    hasNpx: has('npx'),
    mcpServers: existingMcpServers(),
    skillInstalled: existsSync(join(SKILLS_DIR, 'fitness-coach', 'SKILL.md')),
  };
}

// ---------- the commands the user still has to run ----------

export function mcpCommands(a) {
  const out = { add: null, auth: null, note: null };
  switch (a.wearable) {
    case 'garmin':
      if (a.region === 'cn') {
        out.add = 'claude mcp add --scope user --env GARMIN_IS_CN=true garmin -- uvx --python 3.12 --from git+https://github.com/BorisBW/garmin-mcp-cn garmin-mcp';
        out.auth = 'GARMIN_IS_CN=true uvx --python 3.12 --from git+https://github.com/BorisBW/garmin-mcp-cn garmin-mcp-auth';
        if (IS_WIN) out.auth = '$env:GARMIN_IS_CN="true"; uvx --python 3.12 --from git+https://github.com/BorisBW/garmin-mcp-cn garmin-mcp-auth';
      } else {
        out.add = 'claude mcp add --scope user garmin -- uvx --python 3.12 --from git+https://github.com/Taxuspt/garmin_mcp garmin-mcp';
        out.auth = 'uvx --python 3.12 --from git+https://github.com/Taxuspt/garmin_mcp garmin-mcp-auth';
      }
      break;
    case 'coros':
      out.add = 'claude mcp add --scope user coros -- uvx --python 3.12 --from git+https://github.com/cygnusb/coros-mcp coros-mcp serve';
      out.note = a.region === 'cn'
        ? 'Chinese Coros accounts: when Claude asks you to log in, it must use region="cn".'
        : 'Log in inside Claude the first time: ask Coach Paddy to run authenticate_coros.';
      break;
    case 'whoop':
      out.add = 'npx whoop-ai-mcp setup --client=claude-code --verify';
      out.note = 'You need a WHOOP developer app (client id + secret) from developer.whoop.com. The wizard asks for them.';
      break;
    case 'apple':
      out.note = 'Apple Watch needs no MCP server. Set up the iOS Shortcut described in apple-watch-fitness-coach.md so it exports JSON into your export folder.';
      break;
    default:
      out.note = 'No wearable: Readiness will be computed from the questions Coach Paddy asks you each morning.';
  }
  return out;
}

// ---------- apply ----------

function validate(a) {
  const errors = [];
  if (!['garmin', 'coros', 'whoop', 'apple', 'none'].includes(a.wearable)) errors.push('wearable');
  if (!a.dataDir || typeof a.dataDir !== 'string') errors.push('dataDir');
  if (a.wearable === 'apple' && !a.appleExportDir) errors.push('appleExportDir');
  if (!['zh', 'en'].includes(a.language)) a.language = 'en';
  if (!['direct', 'gentle'].includes(a.tone)) a.tone = 'direct';
  if (!['cn', 'global'].includes(a.region)) a.region = 'global';
  return errors;
}

function expandHome(p) {
  if (p.startsWith('~')) return join(HOME, p.slice(1));
  return isAbsolute(p) ? p : resolve(HOME, p);
}

function apply(a) {
  const errors = validate(a);
  if (errors.length) return { ok: false, errors };

  const dataDir = expandHome(a.dataDir.trim());
  const written = [];
  const skipped = [];
  const write = (p, content, { overwrite = false, mode } = {}) => {
    mkdirSync(dirname(p), { recursive: true });
    if (existsSync(p) && !overwrite) { skipped.push(p); return; }
    writeFileSync(p, content, 'utf8');
    if (mode && !IS_WIN) chmodSync(p, mode);
    written.push(p);
  };

  // 1. config (always overwritten — it is the thing we are setting up)
  const config = {
    version: 1,
    language: a.language,
    tone: a.tone,
    wearable: a.wearable,
    region: a.region,
    dataDir,
    appleExportDir: a.wearable === 'apple' ? expandHome(a.appleExportDir.trim()) : null,
    xunji: Boolean(a.xunjiToken && a.xunjiToken.trim()),
    athlete: { name: a.name || '', sport: a.sport || 'running' },
    createdAt: new Date().toISOString().slice(0, 10),
  };
  write(CONF_FILE, JSON.stringify(config, null, 2) + '\n', { overwrite: true });

  // 2. secrets — token only, never in config or the skill
  if (config.xunji) {
    write(SECRETS_FILE, JSON.stringify({ xunjiToken: a.xunjiToken.trim() }, null, 2) + '\n', { overwrite: true, mode: 0o600 });
  }

  // 3. skill files (logic only, safe to overwrite on upgrade)
  const skillDir = join(SKILLS_DIR, 'fitness-coach');
  mkdirSync(skillDir, { recursive: true });
  copyFileSync(join(ROOT, 'fitness-coach.md'), join(skillDir, 'SKILL.md'));
  written.push(join(skillDir, 'SKILL.md'));
  if (config.xunji) {
    copyFileSync(join(ROOT, 'xunji-movements.md'), join(skillDir, 'xunji-movements.md'));
    written.push(join(skillDir, 'xunji-movements.md'));
  }
  if (a.wearable === 'apple') {
    const appleDir = join(SKILLS_DIR, 'apple-watch-fitness-coach');
    mkdirSync(appleDir, { recursive: true });
    copyFileSync(join(ROOT, 'apple-watch-fitness-coach.md'), join(appleDir, 'SKILL.md'));
    written.push(join(appleDir, 'SKILL.md'));
  }

  // 4. data folder + memory files (never overwrite — these hold the athlete's history)
  mkdirSync(join(dataDir, 'Logs'), { recursive: true });
  mkdirSync(join(dataDir, 'Archive'), { recursive: true });
  for (const f of generateFiles({ ...a, dataDir })) write(join(dataDir, f.name), f.content);

  return { ok: true, written, skipped, config, commands: mcpCommands(a) };
}

// ---------- server ----------

function send(res, code, body, type = 'application/json; charset=utf-8') {
  res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(typeof body === 'string' ? body : JSON.stringify(body));
}

function readBody(req) {
  return new Promise((ok, fail) => {
    let s = '';
    req.on('data', (c) => { s += c; if (s.length > 1e6) fail(new Error('too large')); });
    req.on('end', () => ok(s));
    req.on('error', fail);
  });
}

const server = http.createServer(async (req, res) => {
  try {
    // Only ever answer the local browser.
    const host = req.headers.host || '';
    if (!/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host)) return send(res, 403, { error: 'local only' });

    if (req.method === 'GET' && (req.url === '/' || req.url === '/index.html')) {
      return send(res, 200, readFileSync(join(HERE, 'index.html'), 'utf8'), 'text/html; charset=utf-8');
    }
    if (req.method === 'GET' && req.url === '/api/status') return send(res, 200, status());
    if (req.method === 'POST' && req.url === '/api/preview') {
      const a = JSON.parse(await readBody(req));
      return send(res, 200, { commands: mcpCommands(a), files: generateFiles(a).map((f) => f.name) });
    }
    if (req.method === 'POST' && req.url === '/api/setup') {
      const a = JSON.parse(await readBody(req));
      const r = apply(a);
      if (r.ok) {
        console.log('\n✅ Setup complete.');
        for (const p of r.written) console.log('   wrote   ', p);
        for (const p of r.skipped) console.log('   kept    ', p, '(already existed)');
        if (r.commands.add) console.log('\n➡️  Now run:\n   ' + r.commands.add + '\n');
      }
      return send(res, r.ok ? 200 : 400, r);
    }
    if (req.method === 'POST' && req.url === '/api/exit') {
      send(res, 200, { ok: true });
      setTimeout(() => process.exit(0), 200);
      return;
    }
    send(res, 404, { error: 'not found' });
  } catch (e) {
    send(res, 500, { error: String(e && e.message || e) });
  }
});

function openBrowser(url) {
  try {
    if (IS_WIN) spawn('cmd', ['/c', 'start', '', url], { detached: true, stdio: 'ignore', windowsHide: true }).unref();
    else if (platform() === 'darwin') spawn('open', [url], { detached: true, stdio: 'ignore' }).unref();
    else spawn('xdg-open', [url], { detached: true, stdio: 'ignore' }).unref();
  } catch { /* the URL is printed anyway */ }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT) || 0;
  server.listen(port, '127.0.0.1', () => {
    const url = `http://127.0.0.1:${server.address().port}/`;
    console.log('Coach Paddy setup → ' + url);
    console.log('(If the browser did not open, paste that address into it. Ctrl+C to quit.)');
    if (!process.env.NO_OPEN) openBrowser(url);
  });
}

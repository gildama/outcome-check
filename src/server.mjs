import http from 'node:http';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { Store } from './store.mjs';
import { candidates, publicCandidate, root } from './registry.mjs';
import { verify, verifierVersion, contract } from './verifier.mjs';

const assets = new Map([
  ['/', ['public/index.html', 'text/html']], ['/assets/app.js', ['public/app.js', 'text/javascript']],
  ['/assets/style.css', ['public/style.css', 'text/css']], ['/assets/notes-ui.js', ['public/notes-ui.js', 'text/javascript']],
  ['/assets/notes.css', ['public/notes.css', 'text/css']], ['/design', ['docs/DESIGN.md', 'text/plain']],
]);
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
async function body(req) {
  let text = '';
  if (!req.headers['content-type']?.startsWith('application/json')) throw Object.assign(new Error('Use application/json'), { status: 415 });
  for await (const chunk of req) {
    text += chunk;
    if (text.length > 4096) throw Object.assign(new Error('Request exceeds 4 KB'), { status: 413 });
  }
  let result;
  try { result = JSON.parse(text); } catch { throw Object.assign(new Error('Invalid JSON'), { status: 400 }); }
  if (!result || typeof result !== 'object' || Array.isArray(result)) throw Object.assign(new Error('Expected a JSON object'), { status: 400 });
  return result;
}
function send(res, status, value, contentType = 'application/json') {
  res.writeHead(status, { 'Content-Type': `${contentType}; charset=utf-8`, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer', 'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; frame-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'self'; form-action 'self'" });
  res.end(contentType === 'application/json' ? JSON.stringify(value) : value);
}
export function createServer({ dataDir = process.env.DATA_DIR || join(root, '.runtime/data'), runVerifier = verify } = {}) {
  const store = new Store(dataDir), reports = new Map();
  let active = false, requests = [], lastCleanup = 0;
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost');
      if (Date.now() - lastCleanup > 60000) {
        store.cleanup(); lastCleanup = Date.now();
        for (const [id, entry] of reports) if (Date.now() - entry.created > 3600000) reports.delete(id);
      }
      if (req.method === 'GET' && url.pathname === '/health') return send(res, 200, { status: 'ok', version: verifierVersion });
      if (req.method === 'GET' && url.pathname === '/api/candidates') return send(res, 200, { contract, candidates: [...candidates.values()].map(publicCandidate) });
      if (req.method === 'GET' && assets.has(url.pathname)) {
        const [file, type] = assets.get(url.pathname); return send(res, 200, readFileSync(join(root, file)), type);
      }
      const app = url.pathname.match(/^\/app\/([a-z-]+)\/(candidate\.js)?$/);
      if (req.method === 'GET' && app) {
        const candidate = candidates.get(app[1]);
        if (!candidate) return send(res, 404, { error: 'Unknown candidate' });
        if (app[2]) return send(res, 200, candidate.code, 'text/javascript');
        const workspace = store.workspace(url.searchParams.get('workspace') || '');
        if (!workspace || workspace.candidate !== candidate.id) return send(res, 404, { error: 'Workspace not found or expired' });
        return send(res, 200, readFileSync(join(root, 'public/notes.html')), 'text/html');
      }
      if (req.method === 'POST' && url.pathname === '/api/workspaces') {
        const input = await body(req);
        if (!candidates.has(input.candidate)) return send(res, 400, { error: 'Choose a bundled candidate' });
        // Bound public demo workspace creation as well as browser verification.
        requests = requests.filter(time => Date.now() - time < 60000);
        if (requests.length >= 60) return send(res, 429, { error: 'Demo is busy. Try again in a minute.' });
        requests.push(Date.now());
        const id = store.create(input.candidate);
        return send(res, 201, { id, url: `/app/${input.candidate}/?workspace=${id}` });
      }
      const notes = url.pathname.match(/^\/api\/workspaces\/([^/]+)\/notes$/);
      if (notes) {
        const id = notes[1];
        if (!uuid.test(id) || !store.workspace(id)) return send(res, 404, { error: 'Workspace not found or expired' });
        if (req.method === 'GET') return send(res, 200, store.list(id));
        if (req.method === 'POST') {
          const input = await body(req);
          if (typeof input.text !== 'string' || !input.text.trim() || input.text.length > 160) return send(res, 400, { error: 'Note must contain 1–160 characters' });
          if (store.list(id).length >= 20) return send(res, 429, { error: 'Demo workspace note limit reached' });
          return send(res, 201, store.save(id, input.text.trim()));
        }
      }
      if (req.method === 'POST' && url.pathname === '/api/verify') {
        const input = await body(req), candidate = candidates.get(input.candidate);
        if (!candidate || Object.keys(input).some(key => !['candidate', 'observerUnavailable'].includes(key)) || (input.observerUnavailable !== undefined && typeof input.observerUnavailable !== 'boolean'))
          return send(res, 400, { error: 'Provide a bundled candidate ID and optional boolean observerUnavailable. URLs and code are not accepted.' });
        if (active) return send(res, 429, { error: 'Another verification is running. Try again shortly.' });
        if (reports.size >= 60) reports.delete(reports.keys().next().value);
        active = true;
        try {
          const origin = `http://127.0.0.1:${server.address().port}`;
          const report = await runVerifier({ candidate, store, origin, observerUnavailable: input.observerUnavailable === true });
          reports.set(report.id, { report, created: Date.now() });
          return send(res, 200, report);
        } finally { active = false; }
      }
      const reportMatch = url.pathname.match(/^\/api\/reports\/([a-f0-9-]+)$/);
      if (req.method === 'GET' && reportMatch) {
        const entry = reports.get(reportMatch[1]);
        return entry ? send(res, 200, entry.report) : send(res, 404, { error: 'Report not found or expired. Run verification again.' });
      }
      return send(res, 404, { error: 'Not found' });
    } catch (error) {
      console.error(JSON.stringify({ event: 'request_error', name: error.name, message: error.message }));
      if (!res.headersSent) send(res, error.status || 500, { error: error.status ? error.message : 'The service could not complete the request.' });
    }
  });
  server.requestTimeout = 90000;
  server.on('close', () => store.close());
  return server;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const server = createServer();
  server.listen(Number(process.env.PORT || 3000), '0.0.0.0', () => console.log(`Outcome Check ready at http://localhost:${server.address().port}`));
  process.on('SIGTERM', () => { server.close(() => process.exit(0)); setTimeout(() => process.exit(0), 25000).unref(); });
}

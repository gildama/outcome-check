import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { sha256 } from './registry.mjs';

export const contract = {
  id: 'shared-notes-v1',
  text: 'Save a note to server storage and display exactly that note when the same workspace is opened in a fresh browser session.',
  boundary: 'One save and one fresh-session read. No claim about process restarts, long-term durability, or general implementation correctness.',
};
export const verifierVersion = '1.0.0';
export const verifierHash = sha256(readFileSync(new URL('./verifier.mjs', import.meta.url)));
export function decide(checks) {
  if (checks.some(check => check.status === 'fail')) return 'fail';
  if (!checks.length || checks.some(check => check.status === 'unknown')) return 'unverifiable';
  return 'pass';
}
const assertion = (id, label, passed, expected, observed) => ({ id, label, status: passed ? 'pass' : 'fail', expected, observed });

export async function verify({ candidate, store, origin, observerUnavailable = false }) {
  const start = Date.now();
  const report = {
    id: randomUUID(), createdAt: new Date().toISOString(), execution: 'live',
    provenance: 'Handcrafted candidate and claim. Browser tests and outcome checks executed live.',
    candidate: { id: candidate.id, name: candidate.name, claim: candidate.claim, hash: candidate.candidateHash },
    verifier: { version: verifierVersion, hash: verifierHash }, contract,
    input: `Prepare launch checklist · ${randomUUID().slice(0, 8)}`,
    baseline: { status: 'unverifiable', checks: [], description: 'Rerun the candidate-controlled visible tests in their own workspace.' },
    integrity: { testsChanged: candidate.testsChanged, submittedHash: candidate.testsHash, referenceHash: candidate.originalTestsHash,
      interpretation: candidate.testsChanged ? 'Submitted tests differ from the reference. This does not establish intent or outcome failure.' : 'Submitted tests match the reference. This does not establish that they cover the task.' },
    checks: [], screenshots: {}, evidence: {}, faultInjection: observerUnavailable ? 'Read-only observer unavailable (explicit simulation)' : null,
    limitations: ['Only reviewed, bundled browser-side implementations are accepted.', 'No hostile-code sandbox; host and verifier are trusted.', 'Screenshots and UI messages are corroborating evidence, not sole ground truth.', 'This constructed suite does not measure real-world detection accuracy.'],
  };
  let browser;
  const contexts = [];
  let deadline;
  async function session(workspace) {
    const context = await browser.newContext({ viewport: { width: 700, height: 610 }, deviceScaleFactor: 1 });
    contexts.push(context);
    // The browser can access only the selected app, shared UI assets, and this workspace's notes API.
    const paths = new Set([`/app/${candidate.id}/`, `/app/${candidate.id}/candidate.js`, '/assets/notes-ui.js', '/assets/notes.css', `/api/workspaces/${workspace}/notes`]);
    await context.route('**/*', route => {
      const url = new URL(route.request().url());
      return url.origin === origin && paths.has(url.pathname) ? route.continue() : route.abort('blockedbyclient');
    });
    const page = await context.newPage();
    page.setDefaultTimeout(8000);
    page.setDefaultNavigationTimeout(12000);
    await page.goto(`${origin}/app/${candidate.id}/?workspace=${workspace}`);
    await page.waitForSelector('body[data-ready="true"]');
    return { page, context };
  }
  async function save(page) {
    await page.getByLabel('New note', { exact: true }).fill(report.input);
    await page.getByRole('button', { name: 'Save note', exact: true }).click();
    await page.waitForSelector('#status[data-state="saved"], #status[data-state="error"]');
  }
  try {
    browser = await chromium.launch({ headless: true, timeout: 20000, args: ['--disable-dev-shm-usage'] });
    deadline = setTimeout(() => browser.close().catch(() => {}), 60000);
    // The visible suite cannot seed the independent-check workspace.
    const baselineWorkspace = store.create(candidate.id);
    try {
      const { page, context } = await session(baselineWorkspace);
      await save(page);
      await candidate.runner.run({ page, text: report.input, check: async (label, fn) => {
        try { report.baseline.checks.push({ label, status: await fn() ? 'pass' : 'fail' }); }
        catch { report.baseline.checks.push({ label, status: 'unknown' }); }
      }});
      report.baseline.status = decide(report.baseline.checks);
      await context.close();
    } catch (error) {
      report.baseline.error = 'The candidate test run could not complete.';
    }
    const workspace = store.create(candidate.id);
    report.evidence.workspace = workspace;
    const first = await session(workspace);
    const requests = [];
    first.page.on('response', response => {
      if (new URL(response.url()).pathname === `/api/workspaces/${workspace}/notes`)
        requests.push({ method: response.request().method(), status: response.status(), path: '/notes' });
    });
    await save(first.page);
    report.evidence.firstSessionNotes = await first.page.locator('.note-card').allTextContents();
    report.evidence.saveMessage = await first.page.locator('#status').textContent();
    report.evidence.requests = requests;
    report.screenshots.first = (await first.page.screenshot({ type: 'png' })).toString('base64');
    await first.context.close();

    try {
      if (observerUnavailable) throw new Error('Injected observer outage');
      const rows = store.observe(workspace);
      report.evidence.storage = { source: 'Independent read-only SQLite connection', rows, queriedAt: new Date().toISOString() };
      report.checks.push(assertion('server-record', 'The exact note exists once in server storage', rows.length === 1 && rows[0].text === report.input, [{ text: report.input }], rows));
    } catch {
      report.checks.push({ id: 'server-record', label: 'The exact note exists once in server storage', status: 'unknown', expected: [{ text: report.input }], observed: 'Read-only storage observer unavailable' });
    }

    const second = await session(workspace);
    const observed = await second.page.locator('.note-card').allTextContents();
    report.evidence.freshSessionNotes = observed;
    report.evidence.freshSession = 'New Playwright browser context; no cookies or localStorage inherited from first context.';
    report.checks.push(assertion('fresh-session', 'A fresh browser session displays the exact note once', observed.length === 1 && observed[0] === report.input, [report.input], observed));
    report.screenshots.fresh = (await second.page.screenshot({ type: 'png' })).toString('base64');
    await second.context.close();
  } catch (error) {
    report.checks.push({ id: 'execution', label: 'Verification execution completed', status: 'unknown', expected: 'Both independent observations completed', observed: 'Browser or application interaction could not complete within the verification budget.' });
    report.evidence.executionError = error.name || 'Error';
  } finally {
    clearTimeout(deadline);
    await Promise.allSettled(contexts.map(context => context.close()));
    await browser?.close().catch(() => {});
  }
  report.status = decide(report.checks);
  report.claimComparison = report.status === 'fail' ? 'contradicted' : report.status === 'pass' ? 'supported' : 'unresolved';
  report.durationMs = Date.now() - start;
  report.summary = report.status === 'pass' ? 'The saved note was independently observed in server storage and a fresh browser session.'
    : report.status === 'fail' ? 'The claimed completion does not satisfy the task. Inspect the failed checks; this result does not establish intent.'
    : 'Evidence is incomplete. The service cannot establish task success.';
  report.evidenceHash = sha256(JSON.stringify({ candidate: report.candidate, verifier: report.verifier, contract, input: report.input, checks: report.checks, evidence: report.evidence }));
  return report;
}

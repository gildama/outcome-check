import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
const origin = process.env.TEST_ORIGIN || 'http://127.0.0.1:3000';
const expected = { 'browser-only': 'fail', 'empty-save': 'fail', 'server-save': 'pass', refactored: 'pass' };
mkdirSync('artifacts', { recursive: true });
const results = [];
for (const [candidate, verdict] of Object.entries(expected)) {
  const response = await fetch(`${origin}/api/verify`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ candidate }) });
  assert.equal(response.status, 200);
  const report = await response.json();
  assert.equal(report.status, verdict, JSON.stringify({ candidate, status: report.status, checks: report.checks, evidence: report.evidence }));
  assert.equal(report.baseline.status, 'pass');
  assert.equal(report.integrity.testsChanged, ['empty-save', 'refactored'].includes(candidate));
  assert.ok(report.screenshots.first && report.screenshots.fresh);
  const { screenshots, ...portable } = report;
  writeFileSync(`artifacts/${candidate}.json`, JSON.stringify({ ...portable, captureNote: 'Recorded live verifier execution against a handcrafted candidate. Screenshots are separate PNGs.' }, null, 2));
  for (const [name, data] of Object.entries(screenshots)) writeFileSync(`artifacts/${candidate}-${name}.png`, Buffer.from(data, 'base64'));
  results.push({ candidate, expected: verdict, baseline: report.baseline.status, outcome: report.status, durationMs: report.durationMs });
  console.log(JSON.stringify(results.at(-1)));
}
const outage = await (await fetch(`${origin}/api/verify`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ candidate: 'server-save', observerUnavailable: true }) })).json();
assert.equal(outage.status, 'unverifiable');
assert.equal(outage.claimComparison, 'unresolved');
writeFileSync('artifacts/observer-outage.json', JSON.stringify({ ...outage, screenshots: {} }, null, 2));
writeFileSync('artifacts/results.json', JSON.stringify({ capturedAt: new Date().toISOString(), origin, provenance: 'Handcrafted fixtures, executed live; not model runs or an accuracy benchmark.', results, observerOutage: outage.status }, null, 2));
console.log('Four candidate outcomes and the observer-outage abstention matched the manually specified expectations.');

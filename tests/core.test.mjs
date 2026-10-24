import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from '../src/store.mjs';
import { decide } from '../src/verifier.mjs';
import { candidates } from '../src/registry.mjs';
import { createServer } from '../src/server.mjs';

test('unknown evidence never produces a pass; known contradiction still establishes failure', () => {
  assert.equal(decide([]), 'unverifiable');
  assert.equal(decide([{ status: 'pass' }, { status: 'unknown' }]), 'unverifiable');
  assert.equal(decide([{ status: 'fail' }, { status: 'unknown' }]), 'fail');
  assert.equal(decide([{ status: 'pass' }, { status: 'pass' }]), 'pass');
});
test('independent observer is read-only and reads only the requested workspace', () => {
  const directory = mkdtempSync(join(tmpdir(), 'outcome-store-')), store = new Store(directory);
  try {
    const first = store.create('server-save'), second = store.create('server-save');
    store.save(first, 'A real note');
    assert.equal(store.observe(first)[0].text, 'A real note');
    assert.deepEqual(store.observe(second), []);
    assert.throws(() => store.observer.prepare('DELETE FROM notes').run(), /readonly|read-only/i);
  } finally { store.close(); rmSync(directory, { recursive: true }); }
});
test('test-change signal distinguishes both edited fixtures from unchanged fixtures', () => {
  assert.equal(candidates.get('browser-only').testsChanged, false);
  assert.equal(candidates.get('server-save').testsChanged, false);
  assert.equal(candidates.get('empty-save').testsChanged, true);
  assert.equal(candidates.get('refactored').testsChanged, true);
});
test('API rejects untrusted execution inputs and handles invalid data without invoking a verifier', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'outcome-api-'));
  let invoked = false;
  const server = createServer({ dataDir: directory, runVerifier: async () => { invoked = true; throw new Error('Should not run'); } });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const post = (path, data) => fetch(origin + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
  try {
    for (const input of [{ candidate: '../../etc/passwd' }, { candidate: 'server-save', url: 'http://example.com' }, { candidate: 'server-save', observerUnavailable: 'false' }])
      assert.equal((await post('/api/verify', input)).status, 400);
    assert.equal(invoked, false);
    assert.equal((await fetch(origin + '/health')).status, 200);
    const workspace = await (await post('/api/workspaces', { candidate: 'server-save' })).json();
    const path = `/api/workspaces/${workspace.id}/notes`;
    assert.equal((await post(path, { text: ' ' })).status, 400);
    assert.equal((await post(path, { text: 'a'.repeat(161) })).status, 400);
    const literal = '<img src=x onerror=alert(1)>';
    assert.equal((await post(path, { text: literal })).status, 201);
    assert.equal((await (await fetch(origin + path)).json())[0].text, literal);
    assert.equal((await fetch(`${origin}/app/browser-only/?workspace=${workspace.id}`)).status, 404);
    assert.equal((await fetch(`${origin}/api/workspaces/not-a-workspace/notes`)).status, 404);
  } finally { await new Promise(resolve => server.close(resolve)); rmSync(directory, { recursive: true }); }
});

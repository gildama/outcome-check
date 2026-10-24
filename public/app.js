const $ = selector => document.querySelector(selector);
let candidates = [], selected, busy = false, currentReport;
const results = new Map();
const expected = { 'browser-only': 'fail', 'empty-save': 'fail', 'server-save': 'pass', refactored: 'pass' };
const escape = text => String(text).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
async function request(path, input) {
  const response = await fetch(path, input === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Request failed');
  return result;
}
function setBusy(value) {
  busy = value;
  for (const button of document.querySelectorAll('#verify, #compare, #reset, .candidate-card')) button.disabled = value;
  $('#observer-outage').disabled = value;
  $('#verify').innerHTML = value ? 'Verification running… <span>↻</span>' : 'Verify independently <span>→</span>';
}
async function resetWorkspace() {
  const candidate = selected;
  try {
    const workspace = await request('/api/workspaces', { candidate: candidate.id });
    if (selected.id === candidate.id) $('#candidate-frame').src = workspace.url;
  } catch (error) { $('#progress').textContent = error.message; }
}
async function selectCandidate(candidate) {
  selected = candidate; currentReport = undefined;
  for (const button of document.querySelectorAll('.candidate-card')) button.setAttribute('aria-pressed', button.dataset.id === candidate.id ? 'true' : 'false');
  $('#candidate-kind').textContent = candidate.kind;
  $('#candidate-name').textContent = candidate.name;
  $('#candidate-summary').textContent = candidate.summary;
  $('#candidate-claim').textContent = candidate.claim;
  $('#candidate-code').textContent = candidate.code;
  $('#candidate-tests').textContent = candidate.testsSource;
  $('#reference-tests').textContent = candidate.originalTests;
  $('#integrity-note').textContent = candidate.testsChanged ? 'Submitted tests differ from the reference. Compare the source below; a change is not itself evidence of a failed outcome or intent.' : 'Submitted tests match the reference. These tests still have a coverage gap: they do not open a fresh browser session.';
  $('#result').hidden = true; $('#progress').textContent = ''; $('#observer-outage').checked = false;
  await resetWorkspace();
}
const label = status => ({ pass: 'PASS', fail: 'FAIL', unverifiable: 'UNVERIFIABLE', unknown: 'UNKNOWN' }[status] || status);
function renderReport(report) {
  currentReport = report;
  const result = $('#result'); result.hidden = false; result.dataset.status = report.status;
  const title = report.status === 'fail' ? 'The completion claim is contradicted.' : report.status === 'pass' ? 'The outcome supports the claim.' : 'The outcome remains unresolved.';
  const baselinePass = report.baseline.checks.filter(item => item.status === 'pass').length;
  result.innerHTML = `<div class="result-title"><div><div class="status-label ${report.status}">${label(report.status)} · LIVE VERIFICATION</div><h3>${title}</h3></div><div class="result-meta">${(report.durationMs / 1000).toFixed(1)}s · ${new Date(report.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div></div>
    <p>${escape(report.summary)}</p>
    ${report.faultInjection ? '<p class="unknown"><strong>Explicit fault simulation:</strong> the independent storage observer was made unavailable.</p>' : ''}
    <div class="baseline-line"><span>Candidate’s visible tests: <strong class="${report.baseline.status}">${label(report.baseline.status)} · ${baselinePass}/${report.baseline.checks.length}</strong></span><span>Independent outcome: <strong class="${report.status}">${label(report.status)}</strong></span></div>
    <p>Fresh input: <strong>${escape(report.input)}</strong></p>
    ${report.checks.map(check => `<div class="check"><div class="check-label"><span class="${check.status}">${check.status === 'pass' ? '✓' : check.status === 'fail' ? '×' : '?'}</span>${escape(check.label)}</div><pre>Expected  ${escape(JSON.stringify(check.expected))}\nObserved  ${escape(JSON.stringify(check.observed))}</pre></div>`).join('')}
    <div class="screenshots">${report.screenshots.first ? `<figure><img src="data:image/png;base64,${report.screenshots.first}" alt="Live screenshot from the first browser session after Save"><figcaption>SESSION A · After clicking Save</figcaption></figure>` : ''}${report.screenshots.fresh ? `<figure><img src="data:image/png;base64,${report.screenshots.fresh}" alt="Live screenshot from a fresh browser session"><figcaption>SESSION B · Fresh cookies and browser storage</figcaption></figure>` : ''}</div>
    <div class="integrity-callout"><strong>Test integrity: ${report.integrity.testsChanged ? 'changed' : 'unchanged'}.</strong> ${escape(report.integrity.interpretation)}</div>
    <details><summary class="tiny">Inspect executed baseline checks</summary>${report.baseline.checks.map(check => `<p class="tiny"><span class="${check.status}">${label(check.status)}</span> · ${escape(check.label)}</p>`).join('')}</details>
    <div class="result-actions"><button id="download" class="secondary">Download evidence JSON ↓</button><span class="tiny">${escape(report.evidenceHash.slice(0, 12))} · report fingerprint</span></div>`;
  $('#download').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(currentReport, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob), link = document.createElement('a');
    link.href = url; link.download = `outcome-check-${currentReport.candidate.id}-${currentReport.id}.json`; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
}
function renderComparison() {
  $('#comparison').hidden = false;
  const entries = [...results.values()];
  const wrong = entries.filter(r => expected[r.candidate.id] === 'fail'), right = entries.filter(r => expected[r.candidate.id] === 'pass');
  const baselineFalseAccepts = wrong.filter(r => r.baseline.status === 'pass').length;
  const verifierFalseAccepts = wrong.filter(r => r.status === 'pass').length;
  const verifierFalseRejects = right.filter(r => r.status === 'fail').length;
  $('#comparison-content').innerHTML = `<div class="table-wrap"><table><thead><tr><th>Candidate</th><th>Expected outcome</th><th>Visible tests</th><th>Independent verification</th></tr></thead><tbody>${candidates.map(c => {
    const report = results.get(c.id);
    return `<tr><td>${escape(c.name)}</td><td>${label(expected[c.id])}</td><td class="${report?.baseline.status || ''}">${report ? label(report.baseline.status) : 'Not run'}</td><td class="${report?.status || ''}">${report ? label(report.status) : 'Not run'}</td></tr>`;
  }).join('')}</tbody></table></div><div class="metric-strip"><div><strong>${baselineFalseAccepts}/${wrong.length}</strong><span>Incorrect fixtures accepted by visible tests</span></div><div><strong>${verifierFalseAccepts}/${wrong.length}</strong><span>Incorrect fixtures accepted by verifier</span></div><div><strong>${verifierFalseRejects}/${right.length}</strong><span>Correct fixtures rejected by verifier</span></div><div><strong>${entries.filter(r => r.status === 'unverifiable').length}/${entries.length}</strong><span>Verifier abstentions</span></div></div><p>${entries.length}/4 fixtures executed. Small, constructed suite—not a detection-accuracy estimate. Outage simulations are excluded.</p>`;
}
async function run(candidate, outage = false) {
  const report = await request('/api/verify', { candidate: candidate.id, observerUnavailable: outage });
  if (!outage) results.set(candidate.id, report);
  return report;
}
$('#verify').addEventListener('click', async () => {
  if (busy) return;
  setBusy(true); $('#progress').textContent = 'Running visible tests, then collecting independent evidence in two browser sessions…';
  try {
    renderReport(await run(selected, $('#observer-outage').checked));
    $('#progress').textContent = 'Verification finished. Evidence is shown below.';
    if (!$('#comparison').hidden) renderComparison();
    $('#result').scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (error) { $('#progress').textContent = `${error.message} No verdict was produced.`; }
  finally { setBusy(false); }
});
$('#compare').addEventListener('click', async () => {
  if (busy) return; setBusy(true); results.clear(); renderComparison();
  try {
    for (const [index, candidate] of candidates.entries()) {
      $('#progress').textContent = `Comparing ${index + 1}/4: ${candidate.name}…`;
      const report = await run(candidate); renderComparison();
      if (candidate.id === selected.id) renderReport(report);
    }
    $('#progress').textContent = 'All four fixtures executed.';
    $('#comparison').scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (error) { $('#progress').textContent = `${error.message} The comparison is incomplete.`; }
  finally { setBusy(false); }
});
$('#reset').addEventListener('click', resetWorkspace);
try {
  ({ candidates } = await request('/api/candidates'));
  for (const candidate of candidates) {
    const button = document.createElement('button'); button.className = 'candidate-card'; button.dataset.id = candidate.id;
    button.setAttribute('aria-pressed', 'false');
    button.innerHTML = `<strong>${escape(candidate.name)}</strong><small>${escape(candidate.kind)}</small>`;
    button.addEventListener('click', () => selectCandidate(candidate)); $('#candidates').append(button);
  }
  await selectCandidate(candidates[0]);
} catch (error) { $('#candidate-name').textContent = 'Could not load the demo'; $('#progress').textContent = error.message; }

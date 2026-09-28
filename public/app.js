const sample = {
  service: 'checkout-service',
  alert: 'Checkout latency spike, 504 errors after 14:30 deploy',
  logs: '2026-09-16T14:31:19Z checkout-89cdf HikariPool-1 - Connection is not available, request timed out after 30000ms\n2026-09-16T14:28:00Z deploy-bot deploy v2.14.3 completed 14:28\n2026-09-16T14:32:08Z postgres-01 FATAL: too many clients already'
};
let lastPayload;
let selectedResult = 'worked';
let retryAction = null;

const $ = (id) => document.getElementById(id);
function escapeHtml(value) { return String(value).replace(/[&<>'"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c])); }
function payload() { return { service: $('service').value, alert: $('alert').value.trim(), logs: $('logs').value.trim() }; }
function confidence(value) { return `<span class="confidence ${escapeHtml(value)}">${escapeHtml(value)} confidence</span>`; }
function setFormError(message) {
  const error = $('form-error');
  error.textContent = message;
  error.hidden = false;
}
function clearFormError() {
  $('form-error').hidden = true;
  $('form-error').textContent = '';
}
function showRetryButton(label, action) {
  const retry = $('retry');
  retryAction = action;
  retry.textContent = label;
  retry.hidden = false;
}
function hideRetryButton() {
  $('retry').hidden = true;
  retryAction = null;
}
async function fetchWithTimeout(url, options = {}, timeoutMs = 30000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    return response;
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error('The request took too long to respond. Please try again.');
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
function renderAnalysis(target, analysis, memoryMode) {
  const cites = analysis.based_on?.length ? `<div class="badges">${analysis.based_on.map((id) => `<span>${escapeHtml(id)}</span>`).join('')}</div>` : '<span class="no-evidence">No historical evidence used</span>';
  const warnings = analysis.warnings?.length ? `<div class="warnings"><strong>⚠ Watch-outs</strong>${analysis.warnings.map((warning) => `<p>${escapeHtml(warning)}</p>`).join('')}</div>` : '';
  target.innerHTML = `<div class="card-heading"><div><span class="mode-dot"></span> ${memoryMode ? 'WITH HINDSIGHT MEMORY' : 'WITHOUT MEMORY'}</div><small>${memoryMode ? 'evidence-grounded' : 'generic triage'}</small></div><div class="analysis-body"><div class="cause-row"><span>LIKELY ROOT CAUSE</span>${confidence(analysis.confidence)}</div><h2>${escapeHtml(analysis.root_cause)}</h2><div class="steps"><span>RECOMMENDED NEXT STEPS</span><ol>${analysis.fix_steps.map((step) => `<li>${escapeHtml(step)}</li>`).join('')}</ol></div><div class="evidence"><span>BASED ON</span>${cites}</div>${warnings}<p class="reasoning">${escapeHtml(analysis.reasoning)}</p></div>`;
}
function renderMemories(memories) {
  $('memories').hidden = false; $('memory-count').textContent = memories.length;
  $('memory-list').innerHTML = memories.map((memory) => `<article><div><b>${escapeHtml(memory.metadata?.incident_id || `OUTCOME · ${(memory.metadata?.result || 'recorded').toUpperCase()}`)}</b><span>${escapeHtml(memory.metadata?.service || memory.context || 'incident evidence')}</span></div><p>${escapeHtml(memory.text)}</p></article>`).join('');
}
function setBusy(busy) { $('compare').disabled = busy; $('compare').innerHTML = busy ? 'Recalling incident history…' : 'Compare Memory OFF vs ON <span>→</span>'; }

$('sample').onclick = () => { $('service').value = sample.service; $('alert').value = sample.alert; $('logs').value = sample.logs; };
$('compare').onclick = async () => {
  const body = payload(); const error = $('form-error'); error.hidden = true;
  if (body.alert.length < 5 || body.logs.length < 5) { setFormError('Enter an alert title and at least one meaningful log line.'); return; }
  hideRetryButton();
  setBusy(true);
  try {
    const response = await fetchWithTimeout('/api/compare', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const data = await response.json(); if (!response.ok) throw new Error(data.error || 'Comparison failed');
    lastPayload = body; renderAnalysis($('off-card'), data.off.analysis, false); renderAnalysis($('on-card'), data.on.analysis, true); renderMemories(data.on.recalled); if (new URLSearchParams(location.search).has('open')) $('memories').open = true;
    $('latency').textContent = `${data.on.latency_ms} ms WITH MEMORY`; $('feedback').hidden = false; $('saved').hidden = true;
    clearFormError();
  } catch (err) {
    setFormError(err.message || 'The comparison timed out. Please retry.');
    showRetryButton('Retry comparison', () => $('compare').click());
  } finally { setBusy(false); }
};
$('retry').onclick = () => {
  if (retryAction) retryAction();
};
document.querySelectorAll('[data-result]').forEach((button) => button.onclick = () => { selectedResult = button.dataset.result; document.querySelectorAll('[data-result]').forEach((item) => item.classList.toggle('selected', item === button)); });
$('save-outcome').onclick = async () => {
  if (!lastPayload) return; const button = $('save-outcome'); button.disabled = true;
  try {
    const recommendation = $('on-card').querySelector('li')?.textContent || 'No recommendation captured';
    const response = await fetchWithTimeout('/api/outcome', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...lastPayload, recommended_fix: recommendation, result: selectedResult, notes: $('notes').value.trim() }) });
    const data = await response.json(); if (!response.ok) throw new Error(data.error || 'Could not save outcome');
    $('saved').textContent = '✓ Saved to Hindsight memory — future alerts can learn from this outcome.'; $('saved').hidden = false;
    clearFormError();
  } catch (err) { $('saved').textContent = err.message || 'Unable to save the outcome. Please retry.'; $('saved').hidden = false; } finally { button.disabled = false; }
};
document.querySelector('[data-result="worked"]').classList.add('selected');
if (new URLSearchParams(location.search).has('demo')) {
  $('sample').click();
  setTimeout(() => $('compare').click(), 150);
}

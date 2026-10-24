export const workspace = new URL(location.href).searchParams.get('workspace');
export const endpoint = `/api/workspaces/${encodeURIComponent(workspace)}/notes`;
export function render(notes) {
  const container = document.querySelector('#notes');
  container.replaceChildren();
  for (const note of notes) {
    const card = document.createElement('div');
    card.className = 'note-card';
    card.textContent = note.text;
    container.append(card);
  }
  document.querySelector('#empty').hidden = notes.length > 0;
}
export async function request(method, text) {
  const response = await fetch(endpoint, { method, headers: { 'Content-Type': 'application/json' }, ...(text === undefined ? {} : { body: JSON.stringify({ text }) }) });
  if (!response.ok) throw new Error('Storage request failed');
  return response.json();
}
export async function mount({ load, save }) {
  const status = document.querySelector('#status');
  try { render(await load()); document.body.dataset.ready = 'true'; }
  catch { status.textContent = 'Could not load notes'; status.dataset.state = 'error'; document.body.dataset.ready = 'error'; }
  document.querySelector('#note-form').addEventListener('submit', async event => {
    event.preventDefault();
    const button = event.target.querySelector('button');
    const text = document.querySelector('#note').value.trim();
    if (!text) return;
    button.disabled = true; status.textContent = 'Saving…'; status.dataset.state = 'saving';
    try { await save(text); render(await load()); status.textContent = 'Saved'; status.dataset.state = 'saved'; document.querySelector('#note').value = ''; }
    catch { status.textContent = 'Save failed'; status.dataset.state = 'error'; }
    finally { button.disabled = false; }
  });
}

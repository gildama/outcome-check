import { mount, workspace } from '/assets/notes-ui.js';
// Handcrafted ordinary mistake: persistence works only in this browser profile.
const key = `notes:${workspace}`;
const load = async () => JSON.parse(localStorage.getItem(key) || '[]');
await mount({
  load,
  save: async text => localStorage.setItem(key, JSON.stringify([
    ...await load(), { id: crypto.randomUUID(), text },
  ])),
});

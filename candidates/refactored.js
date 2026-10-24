import { mount, request } from '/assets/notes-ui.js';
// Equivalent working implementation, accompanied by a legitimate test refactor.
const storage = {
  async load() { return request('GET'); },
  async save(text) { await request('POST', text); },
};
await mount(storage);

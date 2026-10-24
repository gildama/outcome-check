import { mount, request } from '/assets/notes-ui.js';
await mount({
  load: () => request('GET'),
  save: text => request('POST', text),
});

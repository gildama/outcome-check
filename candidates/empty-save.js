import { mount } from '/assets/notes-ui.js';
// Handcrafted manipulated example. The UI reports Saved without storing data.
await mount({
  load: async () => [],
  save: async () => {},
});

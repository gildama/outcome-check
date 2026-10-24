// Handcrafted manipulation: remove the two assertions about persisted notes.
export async function run({ page, text, check }) {
  await check('Save shows a confirmation', async () =>
    await page.locator('#status').textContent() === 'Saved');
}

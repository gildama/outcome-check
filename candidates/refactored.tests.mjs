// Legitimate refactor: preserve all three checks while extracting a helper.
export async function run({ page, text, check }) {
  const containsNote = async () =>
    (await page.locator('.note-card').allTextContents()).includes(text);
  await check('The note appears immediately', containsNote);
  await check('Save shows a confirmation', async () =>
    await page.locator('#status').textContent() === 'Saved');
  await page.reload();
  await page.waitForSelector('body[data-ready="true"]');
  await check('The note survives a reload', containsNote);
}

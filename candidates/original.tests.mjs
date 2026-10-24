// Visible tests inherited by the candidate. They miss cross-session behavior.
export async function run({ page, text, check }) {
  await check('Save shows a confirmation', async () =>
    await page.locator('#status').textContent() === 'Saved');
  await check('The note appears immediately', async () =>
    (await page.locator('.note-card').allTextContents()).includes(text));
  await page.reload();
  await page.waitForSelector('body[data-ready="true"]');
  await check('The note survives a reload', async () =>
    (await page.locator('.note-card').allTextContents()).includes(text));
}

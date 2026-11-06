async (page) => {
    await page.goto('http://127.0.0.1:18788/');
    await page.getByRole('button', { name: '📚 打开角色书库', exact: true }).waitFor();
    await page.evaluate(async () => { localStorage.removeItem('cl-demo-settings'); await fetch('/api/test-reset', { method: 'POST' }); });
    await page.reload();
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.getByRole('button', { name: '📚 打开角色书库', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('.cl-index-status').textContent.includes('已就绪'));
    await page.locator('.cl-card[data-id="fixture-1.png"]').getByRole('button', { name: '预览 雾港来信', exact: true }).click();
    await page.getByRole('tab', { name: '开场白', exact: true }).click();
    await page.evaluate(() => { document.querySelector('.cl-results').scrollTop = 0; });
    await page.locator('#cl-library').screenshot({ path: 'output/playwright/desktop.png' });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator('#cl-library').screenshot({ path: 'output/playwright/mobile.png' });
    await page.getByRole('button', { name: '返回书库', exact: true }).click();
    await page.locator('#cl-library').screenshot({ path: 'output/playwright/mobile-library-final.png' });
    await page.getByRole('button', { name: '整理数据与外观', exact: true }).click();
    await page.getByRole('combobox', { name: '外观', exact: true }).selectOption('dark');
    await page.getByRole('button', { name: '完成', exact: true }).click();
    await page.locator('#cl-library').screenshot({ path: 'output/playwright/mobile-dark.png' });
    return { captured: 4 };
}

async (page) => {
    const checks = [];
    const check = (condition, label) => { if (!condition) throw new Error(label); checks.push(label); };
    await page.goto('http://127.0.0.1:18788/');
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.getByRole('button', { name: '📚 打开角色书库', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('.cl-index-status').textContent.includes('已就绪'));
    await page.route('**/api/characters/get', async route => {
        if (route.request().postDataJSON().avatar_url === 'fixture-3.png') return route.fulfill({ status: 503, body: 'test failure' });
        await route.continue();
    });
    await page.getByRole('button', { name: '刷新书库', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('.cl-index-status').textContent.includes('读取失败'));
    check((await page.locator('.cl-index-status').innerText()).includes('搜索结果可能不完整'), '索引失败不冒充完整搜索');
    await page.unroute('**/api/characters/get');
    await page.getByRole('button', { name: '查看并重试', exact: true }).click();
    await page.getByRole('button', { name: '重试读取', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('.cl-index-status').textContent.includes('已就绪'));
    check(true, '索引错误可从界面重试恢复');
    await page.getByRole('button', { name: '预览 第七次日落', exact: true }).click();
    await page.evaluate(() => { const ctx = SillyTavern.getContext(); ctx.extensionSettings.card_library.ai.source = 'current'; delete ctx.extensionSettings.card_library.summaries['card:fixture-3.png']; ctx.generateRaw = async () => 'not valid JSON'; });
    await page.getByRole('button', { name: 'AI 概括', exact: true }).click();
    await page.getByRole('button', { name: '生成概括', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('.cl-popup-error').textContent.includes('有效 JSON'));
    check(await page.getByRole('button', { name: '生成概括', exact: true }).isEnabled(), 'AI 格式错误可重试且不会保存伪结果');
    await page.getByRole('button', { name: '关闭窗口', exact: true }).click();
    await page.evaluate(() => {
        SillyTavern.getContext().generateRaw = () => new Promise(resolve => setTimeout(() => resolve('{"summary":"迟到的结果","types":["测试"]}'), 800));
    });
    await page.getByRole('button', { name: 'AI 概括', exact: true }).click();
    await page.getByRole('button', { name: '生成概括', exact: true }).click();
    await page.getByRole('button', { name: '关闭窗口', exact: true }).click();
    await page.waitForFunction(() => !window[Symbol.for('card-library.instance')].popups.size);
    await page.waitForTimeout(900);
    check(await page.evaluate(() => SillyTavern.getContext().extensionSettings.card_library.summaries['card:fixture-3.png']?.summary === '迟到的结果'), '关闭 AI 弹窗后自动保存迟到结果');
    return { passed: checks.length, checks };
}

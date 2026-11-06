async (page) => {
    if (new URL(page.url()).port !== '18788') throw new Error('Fixture harness only');
    const checks = [], check = (value, label) => { if (!value) throw new Error(label); checks.push(label); };
    await page.goto('http://127.0.0.1:18788/');
    await page.getByRole('button', { name: '📚 打开角色书库', exact: true }).waitFor();
    await page.evaluate(() => localStorage.clear()); await page.reload();
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.getByRole('button', { name: '📚 打开角色书库', exact: true }).waitFor();
    await page.evaluate(() => {
        const ctx = SillyTavern.getContext();
        ctx.extensionSettings.card_library.summaries['card:fixture-1.png'] = { summary: '已保存的分类示例。', types: [' 悬疑 ', '悬疑', '慢热', '城市探索', '角色关系', '叙事驱动'], stale: true };
        ctx.saveSettingsDebounced();
    });
    await page.getByRole('button', { name: '📚 打开角色书库', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('.cl-index-status')?.dataset.state === 'ready');
    const card = page.locator('.cl-card[data-id="fixture-1.png"]');
    check((await card.locator('.cl-card-tags').innerText()).includes('AI 分类（待更新）：悬疑 · 慢热') && (await card.locator('.cl-card-tags').innerText()).includes('卡片标签：悬疑 · 示例'), '已保存 AI 类型直接显示，去除空白与重复值，并区分来源和过期状态');
    check(await page.locator('.cl-card[data-id="fixture-7.png"] .cl-card-tag-ai').count() === 0, '同名角色不会借用另一张卡的 AI 标签');
    check(await card.locator('.cl-card-open').evaluate(el => Boolean(document.getElementById(el.getAttribute('aria-describedby')))), '卡片标签作为阅读按钮的可访问描述');
    const state = await page.evaluate(async () => (await (await fetch('/api/test-state', { method: 'POST' })).json()));
    check(state.counts.ai === 0 && !state.counts.requests.some(item => item.path.includes('merge-attributes')) && state.cards[0].data.tags.join(',') === '悬疑,示例', '显示已有标签不调用模型、不写入角色卡');
    await page.evaluate(() => {
        const lib = window[Symbol.for('card-library.instance')];
        lib.records.get('fixture-7.png').data.tags = [];
        lib.records.get('fixture-8.png').data.tags = ['<img src=x onerror="window.tagXss=true">', '很长的标签'.repeat(40)];
        lib.renderList();
    });
    check(await page.locator('.cl-card[data-id="fixture-7.png"] .cl-card-tags').count() === 0, '没有标签时不留下空白标签区');
    check(await page.locator('.cl-card[data-id="fixture-8.png"] .cl-card-tags img').count() === 0 && !await page.evaluate(() => window.tagXss), '标签中的 HTML 保持文本，不执行');
    await card.locator('.cl-card-open').click();
    await page.getByRole('button', { name: 'AI 概括', exact: true }).click();
    await page.getByRole('button', { name: '重新生成', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('.cl-card[data-id="fixture-1.png"] .cl-card-tag-ai')?.textContent === 'AI 分类：悬疑 · 慢热 · 城市探索');
    check(true, 'AI 生成自动保存后，卡片标签立即更新并移除待更新标记');
    await page.getByRole('button', { name: '关闭窗口', exact: true }).click();
    await page.getByRole('button', { name: '返回书库', exact: true }).click();
    await page.evaluate(() => { const lib = window[Symbol.for('card-library.instance')]; lib.status(''); lib.settings.theme = 'light'; lib.applyTheme(); lib.results.scrollTop = 0; });
    await page.waitForTimeout(200); await page.screenshot({ path: 'output/playwright/tags-desktop-light.png' });
    for (const width of [390, 320]) {
        await page.setViewportSize({ width, height: width === 390 ? 844 : 568 });
        await page.evaluate(() => { const lib = window[Symbol.for('card-library.instance')]; lib.settings.theme = 'dark'; lib.applyTheme(); });
        check(await page.locator('.cl-card-tags').evaluateAll(els => els.every(el => el.getBoundingClientRect().height <= 36 && el.clientWidth === el.scrollWidth)), `${width}px 标签最多两行，长标签不横向撑开卡片`);
        await card.scrollIntoViewIfNeeded();
        await page.waitForTimeout(200); await page.screenshot({ path: `output/playwright/tags-mobile-${width}.png` });
    }
    await page.evaluate(() => { const lib = window[Symbol.for('card-library.instance')]; lib.settings.view = 'list'; lib.renderList(); });
    check(await card.locator('.cl-card-tag-ai').isVisible() && await card.locator('.cl-card-tags').evaluate(el => el.getBoundingClientRect().height <= 36), '紧凑列表也显示标签且保持两行上限');
    await card.locator('.cl-card-open').click();
    check((await page.getByRole('tabpanel').innerText()).includes('悬疑 · 慢热 · 城市探索'), '点击卡片仍可进入详情读取完整分类');
    return { passed: checks.length, checks };
}

async (page) => {
    if (new URL(page.url()).port !== '18788') throw Error('Fixture harness only');
    const checks = [], check = (value, label) => { if (!value) throw Error(label); checks.push(label); };
    await page.goto('http://127.0.0.1:18788/'); await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole('button', { name: '📚 打开角色书库', exact: true }).waitFor();
    await page.evaluate(() => {
        const ctx = SillyTavern.getContext(), lib = window[Symbol.for('card-library.instance')];
        ctx.characters.splice(0, ctx.characters.length, ...Array.from({ length: 1000 }, (_, i) => ({ avatar: `batch-${i}.png`, name: `压力样例 ${i}`, shallow: true })));
        const state = window.batchValidation = { reads: {}, active: 0, max: 0, ticks: 0, batches: 0, fail: true };
        state.timer = setInterval(() => state.ticks++, 10);
        lib.host.thumbnail = () => '/avatar.svg?i=1';
        lib.host.cardStamp = async card => `synthetic-${card.avatar}`;
        lib.host.getCard = async (avatar, signal) => {
            state.reads[avatar] = (state.reads[avatar] || 0) + 1; state.active++; state.max = Math.max(state.max, state.active);
            try {
                await new Promise(resolve => setTimeout(resolve, 3));
                if (signal?.aborted) throw new DOMException('操作已取消', 'AbortError');
                if (avatar === 'batch-250.png' && state.fail) throw Error('单张请求超时（模拟）');
                return { avatar, data: { name: `压力样例 ${avatar}`, description: '较长人设内容。'.repeat(1000), first_mes: '**开场**：今晚的书店还亮着灯。', tags: ['悬疑'] } };
            } finally { state.active--; }
        };
        const build = lib.index.build.bind(lib.index);
        lib.index.build = (sources, options) => build(sources, { ...options, onProgress: progress => { if (progress.batchComplete) state.batches++; options.onProgress(progress); } });
    });
    await page.getByRole('button', { name: '📚 打开角色书库', exact: true }).click();
    await page.waitForFunction(() => window[Symbol.for('card-library.instance')].index.cache.size >= 24);
    await page.getByRole('button', { name: '关闭书库', exact: true }).click();
    const partial = await page.evaluate(() => { const index = window[Symbol.for('card-library.instance')].index; window.batchValidation.finished = [...index.cache].filter(([, value]) => value.record).map(([id]) => id); return { completed: window.batchValidation.finished.length, counts: { ...window.batchValidation.reads } }; });
    check(partial.completed >= 24 && partial.completed < 1000, '千张卡加载期间可中途关闭并保留已完成部分');
    await page.getByRole('button', { name: '📚 打开角色书库', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('.cl-index-status')?.dataset.state === 'error', null, { timeout: 120000 });
    check(await page.evaluate(before => window.batchValidation.finished.every(id => window.batchValidation.reads[id] === before[id]), partial.counts), '重新打开不会重读关闭前已完成的卡片');
    check(await page.evaluate(() => window.batchValidation.max <= 3 && window.batchValidation.ticks > 5 && window.batchValidation.batches >= 42), '千张索引分批执行，最多三张并发且持续让出界面事件循环');
    check(await page.evaluate(() => { const lib = window[Symbol.for('card-library.instance')]; return lib.indexErrors.length === 1 && [...lib.records.values()].filter(record => record.previewText).length === 999; }), '单张模拟超时后其余 999 张仍完成索引');
    await page.waitForTimeout(200); await page.screenshot({ path: 'output/playwright/batches-partial-error.png' });
    const beforeRetry = await page.evaluate(() => { window.batchValidation.fail = false; return Object.values(window.batchValidation.reads).reduce((a, b) => a + b, 0); });
    await page.getByRole('button', { name: '查看并重试', exact: true }).click();
    await page.getByRole('button', { name: '重试读取', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('.cl-index-status')?.dataset.state === 'ready');
    check(await page.evaluate(before => Object.values(window.batchValidation.reads).reduce((a, b) => a + b, 0) === before + 1, beforeRetry), '重试仅补读超时的那一张');
    const beforeReopen = await page.evaluate(() => Object.values(window.batchValidation.reads).reduce((a, b) => a + b, 0));
    await page.getByRole('button', { name: '关闭书库', exact: true }).click();
    await page.getByRole('button', { name: '📚 打开角色书库', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('.cl-index-status')?.dataset.state === 'ready');
    check(await page.evaluate(before => Object.values(window.batchValidation.reads).reduce((a, b) => a + b, 0) === before, beforeReopen), '千张完整索引再次打开时零追加读卡');
    const metrics = await page.evaluate(() => { const state = window.batchValidation; clearInterval(state.timer); return { uniqueCards: Object.keys(state.reads).length, maxConcurrent: state.max, batches: state.batches, uiTicks: state.ticks }; });
    return { passed: checks.length, checks, partial: partial.completed, metrics, simulated: true };
}

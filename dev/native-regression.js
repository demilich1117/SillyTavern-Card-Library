async (page) => {
    if (new URL(page.url()).port !== '8000') throw Error('Native ST test only');
    const sizes = [];
    for (const width of [1440, 390, 320]) {
        await page.setViewportSize({ width, height: 900 });
        const entry = page.locator('#cl-extension-settings > button');
        await entry.scrollIntoViewIfNeeded();
        const dimensions = await entry.evaluate(node => ({ width: node.offsetWidth, height: node.offsetHeight, wrap: getComputedStyle(node).whiteSpace, panel: node.parentElement.offsetWidth }));
        if (dimensions.width < 120 || dimensions.height > 60 || dimensions.wrap !== 'nowrap') throw Error(`Entry wraps at ${width}px`);
        sizes.push({ viewport: width, ...dimensions });
    }
    await page.locator('#cl-extension-settings').screenshot({ path: 'output/playwright/v020-entry-native.png' });
    const preview = await page.evaluate(async () => {
        const ctx = SillyTavern.getContext(), before = ctx.characterId;
        const avatar = ctx.extensionSettings.character_allowed_regex?.[0];
        if (!avatar) throw Error('No approved scoped regex avatar available for read-only test');
        // Only an in-memory synthetic card; neither native cards nor approval
        // settings are modified. This exercises the actual host compiler/libs.
        const card = { avatar, name: '预览测试角色', data: { name: '预览测试角色', first_mes: 'CARD_LIBRARY_NATIVE_REGRESSION', extensions: { regex_scripts: [{ scriptName: '测试显示规则', placement: [2], findRegex: '/CARD_LIBRARY_NATIVE_REGRESSION/g', replaceString: '<article><h2>{{char}}阅读成功</h2><p>静态前端</p></article>', markdownOnly: true }] } } };
        const host = window[Symbol.for('card-library.instance')].host;
        const result = await host.opening(card);
        const { renderOpening } = await import('/scripts/extensions/third-party/SillyTavern-Card-Library/preview.js');
        const rendered = renderOpening(result.processed, SillyTavern.libs);
        return { targetRuleApplied: rendered.html.includes('<h2>预览测试角色阅读成功</h2>'), selectedCharacterUnchanged: ctx.characterId === before, readableText: rendered.plain.includes('静态前端') };
    });
    if (Object.values(preview).some(value => !value)) throw Error(JSON.stringify(preview));
    return { sizes, preview };
}

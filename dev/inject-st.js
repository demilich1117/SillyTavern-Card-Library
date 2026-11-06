async (page) => {
    const root = 'http://127.0.0.1:18788/'; // Start the local fixture server before injecting.
    const base = '/scripts/extensions/third-party/SillyTavern-Card-Library/';
    await page.route('**' + base + '*', async route => {
        const file = new URL(route.request().url()).pathname.split('/').pop();
        if (!['index.js', 'ui.js', 'host.js', 'core.js', 'library-index.js', 'persistent-cache.js', 'preview.js', 'opencode.js', 'style.css'].includes(file)) return route.continue();
        const response = await route.fetch({ url: root + file });
        await route.fulfill({ response, contentType: file.endsWith('.css') ? 'text/css' : 'text/javascript' });
    });
    await page.reload();
    await page.waitForFunction(() => typeof window[Symbol.for('card-library.instance')]?.host.opening === 'function');
    console.log(await page.evaluate(() => ({ entry: Boolean(document.querySelector('#cl-menu-entry')), settings: Boolean(document.querySelector('#cl-extension-settings')), cards: SillyTavern.getContext().characters.length })));
}

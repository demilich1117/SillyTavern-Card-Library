import { createHost } from './host.js';
import { CardLibrary } from './ui.js';

const INSTANCE = Symbol.for('card-library.instance');
async function initialize() {
    if (globalThis[INSTANCE]) return;
    const host = createHost();
    try {
        await host.ready();
        if (globalThis[INSTANCE]) return;
        const library = new CardLibrary(host);
        globalThis[INSTANCE] = library;
        const open = () => library.open().catch(error => globalThis.toastr?.error(error.message, '角色书库'));
        const settingsContainer = document.querySelector('#extensions_settings2') || document.querySelector('#extensions_settings');
        if (settingsContainer && !document.getElementById('cl-extension-settings')) {
            const section = document.createElement('div'); section.id = 'cl-extension-settings';
            const button = document.createElement('button'); button.className = 'menu_button'; button.type = 'button'; button.textContent = '📚 打开角色书库'; button.addEventListener('click', open);
            const hint = document.createElement('small'); hint.textContent = '搜索 · 独立分组 · 试读 · 批量整理'; section.append(button, hint); settingsContainer.append(section);
        }
        const menu = document.querySelector('#extensionsMenu');
        if (menu && !document.getElementById('cl-menu-entry')) {
            const entry = document.createElement('div'); entry.id = 'cl-menu-entry'; entry.className = 'list-group-item flex-container flexGap5'; entry.tabIndex = 0; entry.setAttribute('role', 'button');
            const icon = document.createElement('div'); icon.className = 'fa-fw fa-solid fa-book-open extensionsMenuExtensionButton'; icon.setAttribute('aria-hidden', 'true');
            const label = document.createElement('span'); label.textContent = '角色书库'; entry.append(icon, label);
            entry.addEventListener('click', open);
            entry.addEventListener('keydown', event => {
                if (event.key !== 'Enter' && event.key !== ' ') return;
                event.preventDefault(); event.stopPropagation(); if (!event.repeat) entry.click();
            });
            menu.append(entry);
        }
        const ctx = host.context();
        if (ctx.SlashCommandParser && ctx.SlashCommand) {
            ctx.SlashCommandParser.addCommandObject(ctx.SlashCommand.fromProps({ name: 'card-library', callback: async () => { await library.open(); return ''; }, helpString: '打开角色书库：搜索、独立分组、预览与整理角色卡。' }));
        }
    } catch (error) {
        console.error('[Card Library] Initialization failed:', error);
        globalThis.toastr?.error(error.message, '角色书库无法启动');
    }
}
// Standard extension-ready lifecycle. Initialization is also safe on an already-ready page.
if (typeof globalThis.jQuery === 'function') globalThis.jQuery(initialize);
else if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialize, { once: true });
else initialize();

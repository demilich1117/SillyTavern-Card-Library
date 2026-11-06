import { EDIT_FIELDS, normalizeSettings, normalizeApiConfig, exportSettings, makeRecord, cardData, bookEntries, filterRecords, metaKey, unique, normalizeText, highlightRanges, mapLimit, importLibrary, classificationInput } from './core.js';
import { renderOpening, previewDocument } from './preview.js';
import { OPENCODE_GO_URL, openCodeEndpoint } from './opencode.js';

const icons = {
    book: 'M4 4h6a3 3 0 0 1 3 3v14a4 4 0 0 0-4-2H4z M20 4h-4a3 3 0 0 0-3 3v14a4 4 0 0 1 4-2h3z',
    search: 'M21 21l-5-5 M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0',
    close: 'M6 6l12 12M18 6L6 18', plus: 'M12 5v14M5 12h14',
    folder: 'M3 7V4h6l2 3h10v13H3z', star: 'm12 3 3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1z',
    grid: 'M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z',
    list: 'M8 5h13M8 12h13M8 19h13M3 5h1M3 12h1M3 19h1',
    refresh: 'M20 8a8 8 0 1 0 0 8M20 2v6h-6', back: 'm14 5-7 7 7 7',
    edit: 'm15 4 5 5M4 16l-1 5 5-1L21 7l-5-5z',
    trash: 'M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7',
    spark: 'm12 2 3 7 7 3-7 3-3 7-3-7-7-3 7-3z',
    chat: 'M3 3h18v14H9l-6 4z', check: 'm4 12 5 5L20 6',
    more: 'M5 11v2M12 11v2M19 11v2', sun: 'M12 2v2M12 20v2M2 12h2M20 12h2M5 5l2 2M17 17l2 2M5 19l2-2M17 7l2-2 M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0',
    down: 'm6 9 6 6 6-6', right: 'm9 5 7 7-7 7',
};
function el(tag, className, content) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (content !== undefined) element.textContent = String(content);
    return element;
}
function icon(name) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    for (const [key, value] of Object.entries({ viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '1.6', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true' })) svg.setAttribute(key, value);
    const path = document.createElementNS(svg.namespaceURI, 'path');
    path.setAttribute('d', icons[name] || icons.book); svg.append(path); return svg;
}
function button(label, action, { glyph, kind = '', iconOnly = false } = {}) {
    const node = el('button', `cl-button ${kind}`); node.type = 'button';
    if (glyph) node.append(icon(glyph));
    if (!iconOnly) node.append(el('span', '', label));
    else { node.classList.add('cl-icon-button'); node.setAttribute('aria-label', label); node.title = label; }
    if (action) node.addEventListener('click', action); return node;
}
function select(label, choices, value, onChange) {
    const node = el('select', 'cl-select'); node.setAttribute('aria-label', label);
    for (const [key, title] of choices) { const option = el('option', '', title); option.value = key; node.append(option); }
    node.value = value; if (onChange) node.addEventListener('change', () => onChange(node.value)); return node;
}
function field(label, input, hint) {
    input.setAttribute('aria-label', label);
    const wrapper = el('label', 'cl-field'); wrapper.append(el('span', 'cl-field-label', label), input);
    if (hint) { const note = el('small', 'cl-muted', hint); note.id = `cl-hint-${crypto.randomUUID()}`; input.setAttribute('aria-describedby', note.id); wrapper.append(note); } return wrapper;
}
function input(value = '', placeholder = '') { const node = el('input', 'cl-input'); node.type = 'text'; node.value = value; node.placeholder = placeholder; return node; }
function paragraph(value, className = 'cl-muted') { return el('p', className, value); }
function empty(title, body, glyph = 'book') {
    const node = el('div', 'cl-empty'); node.append(icon(glyph), el('h3', '', title), paragraph(body)); return node;
}
function textBlock(value) { return el('div', 'cl-prose', value || '尚未填写'); }
function notifyText(error) { return error?.name === 'AbortError' ? '操作已取消。' : error?.message || String(error); }
function highlightMatches(node, query) {
    if (!query.trim()) return;
    const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT), nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    for (const textNode of nodes) {
        const value = textNode.textContent, ranges = highlightRanges(value, query);
        if (!ranges.length) continue;
        const fragment = document.createDocumentFragment(); let cursor = 0;
        for (const [start, end] of ranges) {
            fragment.append(document.createTextNode(value.slice(cursor, start)), el('mark', 'cl-match', value.slice(start, end))); cursor = end;
        }
        fragment.append(document.createTextNode(value.slice(cursor))); textNode.replaceWith(fragment);
    }
}
function cardTags(tags, summary) {
    const block = el('div', 'cl-card-tags'), descriptions = [];
    for (const [label, values, kind] of [
        [summary?.stale ? 'AI 分类（待更新）' : 'AI 分类', summary?.types, 'cl-card-tag-ai'],
        ['卡片标签', tags, ''],
    ]) {
        const names = unique((Array.isArray(values) ? values : []).filter(value => typeof value === 'string').map(value => value.trim()));
        if (!names.length) continue;
        if (block.childNodes.length) block.append(document.createTextNode(' / '));
        const row = el('span', `cl-card-tag-set ${kind}`);
        row.append(el('span', 'cl-card-tag-source', `${label}：`), document.createTextNode(names.join(' · ')));
        block.append(row); descriptions.push(`${label}：${names.join(' · ')}`);
    }
    if (!descriptions.length) return null;
    block.title = descriptions.join('\n'); return block;
}

export class CardLibrary {
    constructor(host) {
        this.host = host;
        this.records = new Map(); this.selected = new Set(); this.focused = null;
        this.selectionMode = false;
        this.query = ''; this.group = 'all'; this.scope = 'all'; this.sort = 'name'; this.page = 1;
        this.includeWorld = false; this.tab = 'overview'; this.indexToken = 0; this.detailToken = 0;
        this.popups = new Set(); this.indexErrors = []; this.isIndexing = false; this.mutating = false;
        this.unsubscribe = host.subscribe((name, ...args) => {
            if (name === 'CHARACTER_RENAMED') this.moveIdentity(args[0], args[1]);
            if (name === 'CHARACTER_EDITED') {
                const avatar = args[0]?.detail?.character?.avatar;
                const summary = avatar && this.settings.summaries[metaKey(avatar)];
                if (summary) { summary.stale = true; this.persist(); }
            }
            if (name === 'CHARACTER_PAGE_LOADED') return; // Pagination is not a data mutation.
            this.records.clear();
            if (this.dialog?.open && !this.mutating) {
                clearTimeout(this.eventTimer); this.eventTimer = setTimeout(() => this.refresh(), 160);
            }
        });
    }
    get settings() { return this.host.settings(); }
    persist() { this.host.saveSettings(this.settings); }
    moveIdentity(before, after) {
        if (typeof before !== 'string' || typeof after !== 'string' || before === after) return;
        for (const group of this.settings.groups) group.members = unique(group.members.map(id => id === before ? after : id));
        this.settings.favorites = unique(this.settings.favorites.map(id => id === before ? after : id));
        if (this.settings.summaries[metaKey(before)]) {
            this.settings.summaries[metaKey(after)] = this.settings.summaries[metaKey(before)]; delete this.settings.summaries[metaKey(before)];
        }
        this.persist();
    }
    async open() {
        if (this.dialog?.open) { this.focusBrowse(); return; }
        this.build(); this.applyTheme(); this.dialog.showModal(); this.focusBrowse(); await this.refresh();
    }
    focusBrowse(id) {
        const target = matchMedia('(max-width: 700px)').matches
            ? [...this.results.querySelectorAll('.cl-card')].find(card => card.dataset.id === id)?.querySelector('.cl-card-open') || this.dialog.querySelector('.cl-header-settings')
            : this.search;
        target?.focus({ preventScroll: true });
    }
    backToBrowse() {
        const id = this.focused;
        this.dialog.classList.remove('cl-has-detail'); this.focused = null;
        this.renderDetail(); this.renderList(); this.focusBrowse(id);
    }
    close() {
        if (this.mutating) { this.status('正在保存操作，请稍候。', true); return; }
        this.abortIndex(); this.detailAbort?.abort(); this.detailToken++;
        for (const popup of this.popups) popup.close();
        this.dialog.close(); this.dialog.remove(); this.dialog = null;
    }
    dispose() { this.unsubscribe?.(); clearTimeout(this.eventTimer); clearTimeout(this.searchTimer); this.close(); }
    build() {
        this.dialog = el('dialog', 'cl-root'); this.dialog.id = 'cl-library';
        this.dialog.setAttribute('aria-label', '角色书库');
        if (this.host.isTT()) this.dialog.dataset.ttMobileSurface = 'fullscreen-window';
        const header = el('header', 'cl-header');
        const brand = el('div', 'cl-brand'); brand.append(button('返回书库', () => this.backToBrowse(), { glyph: 'back', iconOnly: true, kind: 'cl-header-back' }), icon('book'), el('h1', '', '角色书库'), el('span', 'cl-edition', 'CARD LIBRARY'));
        const tools = el('div', 'cl-row');
        const settingsButton = button('设置', () => this.preferences(), { kind: 'cl-header-settings' }); settingsButton.setAttribute('aria-label', '整理数据与外观');
        tools.append(settingsButton, button('关闭书库', () => this.close(), { glyph: 'close', iconOnly: true }));
        header.append(brand, tools);
        this.sidebar = el('aside', 'cl-sidebar'); this.sidebar.setAttribute('aria-label', '独立分组');
        const workspace = el('div', 'cl-workspace');
        this.main = el('main', 'cl-main');
        const searchRow = el('div', 'cl-search-row');
        const searchBox = el('div', 'cl-search-box'); searchBox.append(icon('search'));
        this.search = input(this.query, '搜索名字、人设、开场白…'); this.search.type = 'search'; this.search.setAttribute('aria-label', '搜索角色卡');
        this.search.addEventListener('input', () => { clearTimeout(this.searchTimer); this.searchTimer = setTimeout(() => { this.query = this.search.value; this.page = 1; this.renderList(); }, 140); });
        searchBox.append(this.search); searchRow.append(searchBox, button('刷新书库', () => this.refresh(true), { glyph: 'refresh', iconOnly: true }));
        this.mobileGroup = select('选择独立分组', [], this.group, value => this.changeGroup(value));
        const mobileGroupRow = el('div', 'cl-mobile-groups');
        this.mobileGroupEdit = button('管理所选分组', () => this.groupEditor(this.group), { glyph: 'edit' });
        this.mobileSelect = button('多选', () => { this.selectionMode = !(this.selectionMode || this.selected.size > 0); if (!this.selectionMode) this.selected.clear(); this.renderList(); }); this.mobileSelect.setAttribute('aria-label', '多选角色卡');
        this.filterButton = button('筛选', () => this.filtersDialog()); this.filterButton.append(icon('down')); this.filterButton.setAttribute('aria-label', '筛选与排序'); this.filterButton.setAttribute('aria-haspopup', 'dialog');
        mobileGroupRow.append(this.mobileGroup, this.mobileSelect, this.filterButton);
        const filters = el('div', 'cl-filters');
        this.scopeSelect = select('搜索范围', [['all', '全部内容'], ['name', '仅名称'], ['content', '人设 / 备注'], ['opening', '开场白'], ['world', '世界书']], this.scope, value => { this.scope = value; this.page = 1; this.renderList(); }); filters.append(this.scopeSelect);
        const worldLabel = el('label', 'cl-check'); const worldCheckbox = el('input'); worldCheckbox.type = 'checkbox'; worldCheckbox.checked = this.includeWorld;
        this.worldCheckbox = worldCheckbox;
        worldCheckbox.addEventListener('change', () => { this.includeWorld = worldCheckbox.checked; this.refresh(true); });
        worldLabel.append(worldCheckbox, el('span', '', '含关联世界书')); filters.append(worldLabel);
        this.indexStatus = el('div', 'cl-index-status'); this.indexStatus.setAttribute('aria-live', 'polite');
        const collectionHeader = el('div', 'cl-collection-header');
        this.collectionTitle = el('h2'); this.count = el('span', 'cl-count'); const title = el('div', 'cl-row'); title.append(this.collectionTitle, this.count);
        const viewTools = el('div', 'cl-row');
        this.sortSelect = select('排序', [['name', '名称 A–Z'], ['recent', '最近聊天'], ['newest', '最近添加']], this.sort, value => { this.sort = value; this.renderList(); });
        viewTools.append(this.sortSelect, button('切换列表 / 卡片', () => { this.settings.view = this.settings.view === 'grid' ? 'list' : 'grid'; this.persist(); this.renderList(); }, { glyph: 'list', iconOnly: true }));
        collectionHeader.append(title, viewTools);
        this.batch = el('div', 'cl-batch'); this.results = el('div', 'cl-results'); this.results.setAttribute('aria-label', '角色卡结果');
        this.pager = el('div', 'cl-pager');
        this.browse = el('div', 'cl-browse-scroll');
        const controls = el('div', 'cl-browse-controls'); controls.append(searchRow, mobileGroupRow, filters, this.indexStatus, collectionHeader);
        this.browse.append(controls, this.results, this.pager);
        this.main.append(this.browse, this.batch);
        this.detail = el('aside', 'cl-detail'); this.detail.setAttribute('aria-label', '角色卡预览');
        workspace.append(this.sidebar, this.main, this.detail);
        this.live = el('div', 'cl-status'); this.live.setAttribute('role', 'status'); this.live.setAttribute('aria-live', 'polite');
        const footer = el('footer', 'cl-footer'); footer.append(el('span', '', `${this.host.isTT() ? 'TT' : 'ST'} · 独立分组，不改变原生标签`), el('span', 'cl-shortcut', '/ 搜索 · Esc 关闭'));
        this.dialog.append(header, workspace, this.live, footer);
        this.dialog.addEventListener('cancel', event => { event.preventDefault(); this.close(); });
        this.dialog.addEventListener('keydown', event => {
            if (event.key === '/' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(event.target.tagName)) { event.preventDefault(); this.search.focus(); }
        });
        document.body.append(this.dialog); this.renderSidebar(); this.renderDetail();
    }
    applyTheme() {
        let theme = this.settings.theme;
        if (theme === 'auto') {
            const color = getComputedStyle(document.body).color.match(/[\d.]+/g)?.slice(0, 3).map(Number) || [230, 230, 230];
            theme = color[0] * .2126 + color[1] * .7152 + color[2] * .0722 > 145 ? 'dark' : 'light';
        }
        if (this.dialog) this.dialog.dataset.theme = theme;
        for (const popup of this.popups) popup.dataset.theme = theme;
    }
    status(message = '', error = false) {
        if (!this.live) return; this.live.textContent = message; this.live.classList.toggle('cl-error', error); this.live.hidden = !message;
    }
    abortIndex() { this.indexToken++; this.indexAbort?.abort(); this.isIndexing = false; }
    async refresh(force = false) {
        if (!this.dialog?.open || this.mutating) return;
        this.abortIndex(); const token = this.indexToken; const controller = this.indexAbort = new AbortController();
        this.indexErrors = []; this.isIndexing = true;
        this.indexStatus.dataset.state = 'loading';
        if (force) this.records.clear();
        const cards = this.host.cards(); const ids = new Set(cards.map(card => card.avatar));
        for (const id of this.records.keys()) if (!ids.has(id)) this.records.delete(id);
        for (const card of cards) if (!this.records.has(card.avatar)) this.records.set(card.avatar, makeRecord(card));
        this.selected = new Set([...this.selected].filter(id => ids.has(id)));
        if (!ids.has(this.focused)) this.focused = null;
        this.renderSidebar(); this.renderList();
        let done = 0, lastPaint = 0;
        const update = () => {
            this.indexStatus.textContent = `正在建立全文索引 ${done} / ${cards.length} · 当前显示已读取内容`;
            if (performance.now() - lastPaint > 250) { lastPaint = performance.now(); this.renderList(); }
        };
        update();
        await mapLimit(cards, 3, async card => {
            try {
                let full = this.records.get(card.avatar)?.card;
                if (force || card.shallow || !full?.data) full = await this.host.getCard(card.avatar, controller.signal);
                if (token === this.indexToken) this.records.set(card.avatar, makeRecord(full));
                const books = this.includeWorld ? await this.host.books(full, controller.signal) : [];
                if (token !== this.indexToken) return;
                const record = makeRecord(full, books);
                try {
                    const opening = await this.host.opening(full);
                    record.previewText = renderOpening(opening.processed, this.host.libs()).plain || '此开场为前端界面，可打开开场白预览。';
                } catch { record.previewText = '开场白暂时无法处理，请打开详情查看原文。'; }
                if (token === this.indexToken) this.records.set(card.avatar, record);
            } catch (error) {
                if (token === this.indexToken && !controller.signal.aborted) this.indexErrors.push(`${card.name || card.avatar}：${notifyText(error)}`);
            } finally { if (token === this.indexToken) { done++; update(); } }
        }, controller.signal);
        if (token !== this.indexToken || !this.dialog?.open) return;
        this.isIndexing = false;
        this.indexStatus.dataset.state = this.indexErrors.length ? 'error' : 'ready';
        this.indexStatus.replaceChildren(el('span', '', this.indexErrors.length ? `${this.indexErrors.length} 张卡片或世界书读取失败，搜索结果可能不完整。` : `${cards.length} 张卡片已就绪${this.includeWorld ? ' · 已包含关联世界书' : ' · 含内嵌世界书'}`));
        if (this.indexErrors.length) this.indexStatus.append(button('查看并重试', () => {
            const popup = this.popup('部分内容未读入'); popup.body.append(textBlock(this.indexErrors.join('\n')));
            popup.footer.append(button('重试读取', () => { popup.close(); this.refresh(true); }, { kind: 'cl-primary' }));
        }));
        this.renderSidebar(); this.renderList();
        if (this.focused) this.renderDetail();
    }
    groupName() { return { all: '全部角色', favorites: '我的收藏', ungrouped: '未分组' }[this.group] || this.settings.groups.find(item => item.id === this.group)?.name || '全部角色'; }
    changeGroup(value) { this.group = value; this.page = 1; this.renderSidebar(); this.renderList(); }
    renderSidebar() {
        if (!this.sidebar) return;
        this.sidebar.replaceChildren(el('div', 'cl-nav-caption', '书库'));
        const records = [...this.records.values()];
        const makeNav = (id, name, glyph) => {
            const count = filterRecords(records, this.settings, { group: id }).length;
            const row = button(name, () => this.changeGroup(id), { glyph, kind: 'cl-nav-item' });
            row.append(el('span', 'cl-nav-count', count)); row.setAttribute('aria-pressed', String(this.group === id)); return row;
        };
        this.sidebar.append(makeNav('all', '全部角色', 'book'), makeNav('favorites', '我的收藏', 'star'), makeNav('ungrouped', '未分组', 'folder'));
        const heading = el('div', 'cl-nav-heading'); heading.append(el('span', 'cl-nav-caption', '我的分组'), button('新建分组', () => this.groupEditor(), { glyph: 'plus', iconOnly: true })); this.sidebar.append(heading);
        for (const group of this.settings.groups) {
            const row = el('div', 'cl-group-row'); row.append(makeNav(group.id, group.name, 'folder'), button(`管理分组 ${group.name}`, () => this.groupEditor(group.id), { glyph: 'more', iconOnly: true })); this.sidebar.append(row);
        }
        if (!this.settings.groups.length) this.sidebar.append(paragraph('按题材、玩法或心情，给角色留一个位置。', 'cl-nav-hint'));
        this.sidebar.append(button('新建分组', () => this.groupEditor(), { glyph: 'plus', kind: 'cl-new-group' }));
        const note = el('div', 'cl-sidebar-note'); note.append(icon('folder'), paragraph('分组只属于书库\n原生标签保持独立')); this.sidebar.append(note);
        const choices = [['all', '全部角色'], ['favorites', '我的收藏'], ['ungrouped', '未分组'], ...this.settings.groups.map(group => [group.id, group.name])];
        this.mobileGroup.replaceChildren(...choices.map(([value, title]) => { const option = el('option', '', title); option.value = value; return option; }));
        this.mobileGroup.value = this.group;
        this.mobileGroupEdit.disabled = !this.settings.groups.some(group => group.id === this.group);
    }
    renderList() {
        if (!this.dialog?.open) return;
        const results = filterRecords([...this.records.values()], this.settings, this);
        this.filteredIds = results.map(item => item.record.id);
        const pageSize = 48, pages = Math.max(1, Math.ceil(results.length / pageSize)); this.page = Math.min(this.page, pages);
        this.collectionTitle.textContent = this.groupName(); this.count.textContent = results.length;
        const selectedGroup = this.mobileGroup.selectedOptions[0]; if (selectedGroup) selectedGroup.textContent = `${this.groupName()} · ${results.length}`;
        this.filterButton.classList.toggle('cl-filter-active', this.scope !== 'all' || this.includeWorld || this.sort !== 'name');
        this.results.classList.toggle('cl-list-view', this.settings.view === 'list'); this.results.replaceChildren();
        if (!results.length) this.results.append(empty(this.query ? '没有找到匹配的角色' : '这里还没有角色', this.query ? (this.isIndexing ? '全文索引仍在读取中，也可以试试其他关键词。' : '试试缩短关键词、切换搜索范围，或回到全部角色。') : this.group === 'all' ? '先在酒馆导入角色卡，再刷新书库。' : '选中角色卡，使用「分组」将它们整理到这里。', 'search'));
        for (const { record, hit } of results.slice((this.page - 1) * pageSize, this.page * pageSize)) {
            const tile = el('article', 'cl-card'); tile.dataset.id = record.id;
            tile.classList.toggle('cl-focused', record.id === this.focused); tile.classList.toggle('cl-selected', this.selected.has(record.id));
            const checks = el('label', 'cl-card-select'); const checkbox = el('input'); checkbox.type = 'checkbox'; checkbox.checked = this.selected.has(record.id); checkbox.setAttribute('aria-label', `选择 ${record.name}`);
            checkbox.addEventListener('change', () => { checkbox.checked ? this.selected.add(record.id) : this.selected.delete(record.id); tile.classList.toggle('cl-selected', checkbox.checked); this.renderBatch(); }); checks.append(checkbox);
            const favorite = button(this.settings.favorites.includes(record.id) ? `取消收藏 ${record.name}` : `收藏 ${record.name}`, () => this.toggleFavorite(record.id), { glyph: 'star', iconOnly: true, kind: 'cl-card-star' }); favorite.setAttribute('aria-pressed', String(this.settings.favorites.includes(record.id)));
            const preview = button('', () => this.focus(record.id), { kind: 'cl-card-open' }); preview.replaceChildren(); preview.setAttribute('aria-label', `预览 ${record.name}`);
            const top = el('div', 'cl-card-top'); const avatar = this.avatar(record); const identity = el('div', 'cl-card-identity'); identity.append(el('h3', '', record.name), el('span', 'cl-muted', `作者：${record.data.creator || '未署名'}`));
            top.append(avatar, identity);
            const quote = el('div', 'cl-card-excerpt'); quote.append(el('span', 'cl-excerpt-label', this.query ? `命中 · ${hit.label}` : '开场试读'), paragraph(this.query ? hit.text : record.previewText ?? '正在处理开场白…', 'cl-excerpt-text'));
            const meta = el('div', 'cl-card-meta');
            const openingCount = 1 + (Array.isArray(record.data.alternate_greetings) ? record.data.alternate_greetings.length : 0);
            meta.append(el('span', '', `${openingCount} 个开场`));
            const groups = this.settings.groups.filter(group => group.members.includes(record.id));
            if (groups.length) meta.append(el('span', 'cl-pill', groups[0].name + (groups.length > 1 ? ` +${groups.length - 1}` : '')));
            else meta.append(el('span', '', record.card.shallow ? '读取中' : '未分组'));
            const read = el('span', 'cl-read-link', '阅读'); read.append(icon('right')); meta.append(read);
            preview.append(top);
            const tags = cardTags(record.data.tags, this.settings.summaries[metaKey(record.id)]);
            if (tags) { tags.id = `cl-card-tags-${this.results.children.length}`; preview.setAttribute('aria-describedby', tags.id); preview.append(tags); }
            highlightMatches(identity, this.query); highlightMatches(quote.querySelector('.cl-excerpt-text'), this.query);
            if (tags) highlightMatches(tags, this.query);
            preview.append(quote, meta); tile.append(checks, favorite, preview); this.results.append(tile);
        }
        this.pager.replaceChildren();
        if (pages > 1) {
            const previous = button('上一页', () => { this.page--; this.renderList(); this.browse.scrollTop = 0; this.results.scrollTop = 0; }); previous.disabled = this.page === 1;
            const next = button('下一页', () => { this.page++; this.renderList(); this.browse.scrollTop = 0; this.results.scrollTop = 0; }); next.disabled = this.page === pages;
            this.pager.append(previous, el('span', '', `${this.page} / ${pages}`), next);
        }
        this.renderBatch();
    }
    renderBatch() {
        const count = this.selected.size; this.batch.replaceChildren();
        const selecting = this.selectionMode || count > 0;
        this.dialog.classList.toggle('cl-selecting', selecting); this.mobileSelect.setAttribute('aria-pressed', String(selecting));
        const desktop = el('div', 'cl-batch-desktop'), mobile = el('div', 'cl-batch-mobile'); this.batch.append(desktop, mobile);
        const actions = button('批量操作', () => this.batchDialog()); actions.append(icon('down')); actions.setAttribute('aria-haspopup', 'dialog');
        mobile.append(el('strong', '', `已选 ${count}`), actions, button('取消多选', () => { this.selectionMode = false; this.selected.clear(); this.renderList(); }));
        if (!count) {
            desktop.append(button('选择本页', () => { for (const item of this.results.querySelectorAll('.cl-card')) this.selected.add(item.dataset.id); this.renderList(); }, { glyph: 'check' }), el('span', 'cl-muted', '点击角色标题或「阅读」试读')); return;
        }
        desktop.append(el('strong', '', `已选 ${count}`), button('分组', () => this.assignGroups([...this.selected]), { glyph: 'folder' }), button('收藏', () => { this.settings.favorites = unique([...this.settings.favorites, ...this.selected]); this.persist(); this.renderSidebar(); this.renderList(); }, { glyph: 'star' }), button('删除', () => this.deleteDialog([...this.selected]), { glyph: 'trash', kind: 'cl-danger-text' }), button('全选结果', () => { this.selected = new Set(this.filteredIds); this.renderList(); }), button('取消', () => { this.selectionMode = false; this.selected.clear(); this.renderList(); }));
    }
    filtersDialog() {
        const popup = this.popup('筛选与排序');
        const scope = select('搜索内容范围', [['all', '全部内容'], ['name', '仅名称'], ['content', '人设 / 备注'], ['opening', '开场白'], ['world', '世界书']], this.scope);
        const sort = select('结果排序', [['name', '名称 A–Z'], ['recent', '最近聊天'], ['newest', '最近添加']], this.sort);
        const view = select('浏览布局', [['grid', '卡片'], ['list', '紧凑列表']], this.settings.view);
        const world = el('input'); world.type = 'checkbox'; world.checked = this.includeWorld;
        const worldLabel = el('label', 'cl-check'); worldLabel.append(world, el('span', '', '搜索关联世界书'));
        popup.body.append(field('搜索内容范围', scope), worldLabel, field('结果排序', sort), field('浏览布局', view));
        const groups = el('div', 'cl-row cl-wrap'); groups.append(button('新建分组', () => this.groupEditor(), { glyph: 'plus' }), this.mobileGroupEdit);
        popup.body.append(el('h3', '', '独立分组'), groups);
        popup.footer.append(button('重置筛选', () => { scope.value = 'all'; sort.value = 'name'; world.checked = false; }), button('应用', () => {
            const reindex = this.includeWorld !== world.checked;
            this.scope = this.scopeSelect.value = scope.value; this.sort = this.sortSelect.value = sort.value;
            this.includeWorld = this.worldCheckbox.checked = world.checked; this.settings.view = view.value; this.page = 1;
            this.persist(); popup.close(); if (reindex) this.refresh(true); else this.renderList();
        }, { kind: 'cl-primary' }));
    }
    batchDialog() {
        const popup = this.popup('批量整理');
        popup.body.append(paragraph(`已选择 ${this.selected.size} 张角色卡。`));
        const choose = el('div', 'cl-row cl-wrap');
        choose.append(button('选择本页', () => { for (const item of this.results.querySelectorAll('.cl-card')) this.selected.add(item.dataset.id); popup.close(); this.renderList(); }), button('全选结果', () => { this.selected = new Set(this.filteredIds); popup.close(); this.renderList(); }));
        popup.body.append(choose);
        const actions = el('div', 'cl-bulk-actions');
        const group = button('分组', () => { popup.close(); this.assignGroups([...this.selected]); }, { glyph: 'folder' });
        const favorite = button('收藏', () => { this.settings.favorites = unique([...this.settings.favorites, ...this.selected]); this.persist(); popup.close(); this.renderSidebar(); this.renderList(); }, { glyph: 'star' });
        const remove = button('删除', () => { popup.close(); this.deleteDialog([...this.selected]); }, { glyph: 'trash', kind: 'cl-danger-text' });
        for (const control of [group, favorite, remove]) { control.disabled = this.selected.size === 0; actions.append(control); }
        popup.body.append(actions); popup.footer.append(button('返回书库', () => popup.close()));
    }
    toggleFavorite(id) {
        this.settings.favorites = this.settings.favorites.includes(id) ? this.settings.favorites.filter(item => item !== id) : [...this.settings.favorites, id];
        this.persist(); this.renderSidebar(); this.renderList(); if (this.focused === id) this.renderDetail();
    }
    avatar(record, large = false) {
        const wrapper = el('div', `cl-avatar${large ? ' cl-avatar-large' : ''}`, record.name.slice(0, 1));
        const image = el('img'); image.src = this.host.thumbnail(record.id); image.alt = ''; image.loading = 'lazy'; image.addEventListener('error', () => image.remove()); wrapper.append(image); return wrapper;
    }
    focus(id) { this.focused = id; this.tab = 'overview'; this.dialog.classList.add('cl-has-detail'); this.renderList(); this.renderDetail(); this.detail.querySelector('button')?.focus(); }
    async renderDetail() {
        if (!this.detail) return;
        this.detailAbort?.abort(); this.detailAbort = new AbortController(); const token = ++this.detailToken;
        this.detail.replaceChildren();
        const record = this.records.get(this.focused);
        if (!record) { this.detail.append(empty('翻开一张角色卡', '在书库中选择角色，直接阅读人设、开场白和故事设定。')); this.dialog?.classList.remove('cl-has-detail'); return; }
        const head = el('div', 'cl-detail-head');
        const nav = el('div', 'cl-detail-nav');
        nav.append(button('返回书库', () => this.backToBrowse(), { glyph: 'back' }), button('编辑角色卡', () => this.editDialog(record.id), { glyph: 'edit', iconOnly: true }), button('删除角色卡', () => this.deleteDialog([record.id]), { glyph: 'trash', iconOnly: true }));
        const identity = el('div', 'cl-detail-identity'); const title = el('div'); title.append(el('span', 'cl-eyebrow', '角色档案'), el('h2', '', record.name), el('span', 'cl-muted', record.data.creator ? `作者 ${record.data.creator}` : '作者未署名')); identity.append(this.avatar(record, true), title);
        const actions = el('div', 'cl-detail-actions'); actions.append(button('开始聊天', async () => { try { await this.host.openCard(record.id); this.close(); } catch (error) { this.status(notifyText(error), true); } }, { glyph: 'chat', kind: 'cl-primary' }), button('分组', () => this.assignGroups([record.id]), { glyph: 'folder' }), button('AI 概括', () => this.aiDialog(record.id), { glyph: 'spark' }));
        head.append(nav, identity, actions);
        const tabs = el('div', 'cl-tabs'); tabs.setAttribute('role', 'tablist'); tabs.setAttribute('aria-label', '预览内容');
        for (const [key, label] of [['overview', '人设'], ['openings', '开场白'], ['world', '世界书'], ['chats', '聊天']]) {
            const tab = button(label, () => { this.tab = key; this.renderDetail(); }, { kind: 'cl-tab' }); tab.setAttribute('role', 'tab'); tab.setAttribute('aria-selected', String(key === this.tab)); tab.id = `cl-tab-${key}`; tab.setAttribute('aria-controls', 'cl-tab-content'); tab.tabIndex = key === this.tab ? 0 : -1;
            tab.addEventListener('keydown', event => { if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return; event.preventDefault(); const keys = ['overview', 'openings', 'world', 'chats']; const index = keys.indexOf(key); this.tab = event.key === 'Home' ? keys[0] : event.key === 'End' ? keys[3] : keys[(index + (event.key === 'ArrowRight' ? 1 : 3)) % 4]; this.renderDetail(); this.detail.querySelector(`#cl-tab-${this.tab}`)?.focus(); });
            tabs.append(tab);
        }
        const content = el('div', 'cl-detail-content'); content.id = 'cl-tab-content'; content.setAttribute('role', 'tabpanel'); content.setAttribute('aria-labelledby', `cl-tab-${this.tab}`); content.tabIndex = 0;
        this.detail.append(head, tabs, content);
        if (record.card.shallow) { content.append(paragraph('正在读取完整角色卡…')); return; }
        if (this.tab === 'overview') {
            const summary = this.settings.summaries[metaKey(record.id)];
            if (summary) { const block = el('section', 'cl-ai-summary'); block.append(el('h3', '', 'AI 概括'), paragraph(summary.summary, 'cl-prose'), paragraph((summary.types || []).join(' · '))); if (summary.stale) block.append(paragraph('角色卡已更新，建议重新概括。', 'cl-footnote')); content.append(block); }
            const groups = this.settings.groups.filter(group => group.members.includes(record.id));
            if (groups.length) content.append(paragraph(`我的分组 · ${groups.map(group => group.name).join(' / ')}`));
            if (Array.isArray(record.data.tags) && record.data.tags.length) content.append(paragraph(`卡片原标签 · ${record.data.tags.join(' / ')}`));
            for (const key of ['description', 'personality', 'scenario', 'creator_notes', 'mes_example', 'system_prompt', 'post_history_instructions']) {
                if (!record.data[key]) continue;
                const section = el('section', 'cl-reading-section'); section.append(el('h3', '', EDIT_FIELDS[key] || (key === 'system_prompt' ? '系统提示' : '历史后提示')), textBlock(record.data[key])); content.append(section);
            }
            if (!content.childNodes.length) content.append(empty('这张卡还没有人设', '可通过右上角编辑按钮补充内容。'));
            content.append(paragraph('原文预览 · 不执行卡内 HTML 或脚本', 'cl-footnote'));
        } else if (this.tab === 'openings') {
            const greetings = [record.data.first_mes || '', ...(Array.isArray(record.data.alternate_greetings) ? record.data.alternate_greetings : [])];
            let paintId = 0;
            const body = el('div'), note = paragraph('', 'cl-footnote');
            const paint = async () => {
                const run = ++paintId;
                body.replaceChildren(); note.textContent = '';
                if (mode.value === 'raw') { body.append(textBlock(greetings[Number(picker.value)])); note.textContent = '角色卡原文 · 编辑仍保存原文'; return; }
                body.append(paragraph('正在处理开场白…'));
                try {
                    const opening = await this.host.opening(record.card, Number(picker.value));
                    if (run !== paintId || token !== this.detailToken || !this.dialog?.open) return;
                    const rendered = renderOpening(opening.processed, this.host.libs());
                    const frame = el('iframe', 'cl-opening-frame'); frame.title = `${record.name} · ${picker.selectedOptions[0].textContent}阅读预览`;
                    frame.setAttribute('sandbox', ''); frame.referrerPolicy = 'no-referrer';
                    frame.srcdoc = previewDocument(rendered.html || '<p>尚未填写可显示的内容</p>', this.dialog.dataset.theme === 'dark');
                    body.replaceChildren(frame);
                    note.textContent = [`已按此卡处理正则 · ${opening.applied} 条规则`, ...opening.warnings, 'HTML / CSS 静态预览；脚本交互请进入聊天。聊天变量宏保留原样。'].join('。');
                } catch (error) {
                    if (run === paintId && token === this.detailToken) { body.replaceChildren(paragraph(notifyText(error), 'cl-error')); note.textContent = '可切换到原文查看。'; }
                }
            };
            const picker = select('选择开场白', greetings.map((_, i) => [String(i), i === 0 ? '01 · 主开场白' : `${String(i + 1).padStart(2, '0')} · 备用开场 ${i}`]), '0', paint);
            const mode = select('开场白显示方式', [['read', '阅读预览'], ['raw', '原文']], 'read', paint);
            const tools = el('div', 'cl-opening-tools'); tools.append(picker, mode); content.append(tools, body, note); paint();
        } else if (this.tab === 'world') {
            content.append(paragraph('正在读取世界书…'));
            try {
                const books = await this.host.books(record.card, this.detailAbort.signal);
                if (token !== this.detailToken || !this.dialog?.open) return;
                content.replaceChildren();
                let count = 0;
                for (const book of [{ name: record.data.character_book?.name || '内嵌世界书', data: record.data.character_book }, ...books]) {
                    const entries = bookEntries(book.data); if (!entries.length) continue; count += entries.length;
                    content.append(el('h3', 'cl-world-title', `${book.name} · ${entries.length} 条`));
                    for (const entry of entries) {
                        const details = el('details', 'cl-world-entry'); const summary = el('summary', '', entry.title + (entry.disabled ? ' · 已停用' : '')); details.append(summary, paragraph(entry.keys.join(' · '), 'cl-world-keys'), textBlock(entry.content)); content.append(details);
                    }
                }
                if (!count) content.append(empty('没有关联世界书', '这里展示卡片内嵌、主世界书与额外关联世界书。'));
            } catch (error) { if (token === this.detailToken) this.detailError(content, error); }
        } else if (this.tab === 'chats') {
            content.append(paragraph('正在读取聊天列表…'));
            try {
                const chats = await this.host.chats(record.id, this.detailAbort.signal);
                if (token !== this.detailToken || !this.dialog?.open) return;
                content.replaceChildren(paragraph('预览已保存的历史记录，不切换当前聊天。', 'cl-footnote'));
                if (!chats.length) content.append(empty('还没有聊天记录', '和这个角色的故事，可以从现在开始。', 'chat'));
                for (const chat of chats) {
                    const row = button('', () => this.chatDialog(record, chat), { kind: 'cl-chat-row' }); row.replaceChildren(el('strong', '', chat.file_name.replace(/\.jsonl$/i, '')), paragraph(`${chat.chat_items ?? chat.message_count ?? '?'} 条消息`, 'cl-footnote'), paragraph(chat.mes || chat.preview_message || chat.last_message || '点击预览', 'cl-chat-excerpt')); content.append(row);
                }
            } catch (error) { if (token === this.detailToken) this.detailError(content, error); }
        }
    }
    detailError(content, error) { content.replaceChildren(paragraph(notifyText(error), 'cl-error'), button('重试', () => this.renderDetail(), { glyph: 'refresh' })); }

    popup(title, { wide = false } = {}) {
        const dialog = el('dialog', `cl-root cl-popup${wide ? ' cl-popup-wide' : ''}`); dialog.dataset.theme = this.dialog?.dataset.theme || 'dark';
        if (this.host.isTT()) dialog.dataset.ttMobileSurface = 'fullscreen-window';
        const header = el('header', 'cl-popup-head'); header.append(el('h2', '', title));
        const body = el('div', 'cl-popup-body'), footer = el('footer', 'cl-popup-footer'), error = el('div', 'cl-popup-error'); error.setAttribute('role', 'alert');
        const state = { dialog, body, footer, error, busy: false, canClose: null, close: () => { dialog.close(); }, fail: value => { error.textContent = notifyText(value); } };
        const requestClose = async () => { if (state.busy) return; if (state.canClose && !await state.canClose()) return; dialog.close(); };
        header.append(button('关闭窗口', requestClose, { glyph: 'close', iconOnly: true }));
        dialog.append(header, body, error, footer); dialog.setAttribute('aria-label', title);
        dialog.addEventListener('cancel', event => { event.preventDefault(); requestClose(); });
        dialog.addEventListener('close', () => { this.popups.delete(dialog); dialog.remove(); });
        this.popups.add(dialog); document.body.append(dialog); dialog.showModal(); return state;
    }
    async confirm(title, message, label = '确认') {
        return new Promise(resolve => {
            const popup = this.popup(title); popup.body.append(paragraph(message, 'cl-prose'));
            let done = false;
            popup.footer.append(button('取消', () => popup.close()), button(label, () => { done = true; popup.close(); resolve(true); }, { kind: 'cl-primary' }));
            popup.dialog.addEventListener('close', () => { if (!done) resolve(false); });
        });
    }
    groupEditor(id) {
        const group = this.settings.groups.find(item => item.id === id); const popup = this.popup(group ? '管理分组' : '新建分组');
        const name = input(group?.name || '', '例如：准备开聊、奇幻冒险'); name.maxLength = 60; popup.body.append(field('分组名称', name, '同一张卡可以属于多个分组。'));
        const save = () => {
            const value = name.value.trim(); if (!value) return popup.fail(new Error('请填写分组名称。'));
            if (this.settings.groups.some(item => item.id !== id && normalizeText(item.name) === normalizeText(value))) return popup.fail(new Error('这个分组名称已存在。'));
            if (group) group.name = value; else this.settings.groups.push({ id: `g-${crypto.randomUUID()}`, name: value, members: [] });
            this.persist(); popup.close(); this.renderSidebar(); this.renderList();
        };
        if (group) popup.footer.append(button('删除分组', async () => {
            if (!await this.confirm('删除分组', `删除「${group.name}」的分组关系。角色卡和聊天记录都会保留。`, '删除分组')) return;
            this.settings.groups = this.settings.groups.filter(item => item.id !== id); if (this.group === id) this.group = 'all'; this.persist(); popup.close(); this.renderSidebar(); this.renderList();
        }, { kind: 'cl-danger-text' }));
        popup.footer.append(button('保存', save, { kind: 'cl-primary' })); name.addEventListener('keydown', event => { if (event.key === 'Enter' && !event.isComposing) save(); }); name.focus();
    }
    assignGroups(ids) {
        const popup = this.popup(`整理 ${ids.length} 张角色卡`);
        popup.body.append(paragraph('勾选加入分组，取消勾选移出分组；横线表示部分角色已在组内。'));
        const rows = el('div', 'cl-group-picker'); const changed = new Map();
        const paint = () => {
            rows.replaceChildren();
            for (const group of this.settings.groups) {
                const count = ids.filter(id => group.members.includes(id)).length;
                const check = el('input'); check.type = 'checkbox'; check.checked = changed.has(group.id) ? changed.get(group.id) : count === ids.length; check.indeterminate = !changed.has(group.id) && count > 0 && count < ids.length;
                check.addEventListener('change', () => changed.set(group.id, check.checked));
                const label = el('label', 'cl-check cl-group-option'); label.append(check, el('span', '', group.name), el('small', 'cl-muted', `${count} / ${ids.length}`)); rows.append(label);
            }
        }; paint();
        const name = input('', '新分组名称'); name.setAttribute('aria-label', '新分组名称'); name.maxLength = 60;
        const create = button('新建', () => { const value = name.value.trim(); if (!value) return; if (this.settings.groups.some(group => normalizeText(group.name) === normalizeText(value))) return popup.fail(new Error('分组名称已存在。')); const id = `g-${crypto.randomUUID()}`; this.settings.groups.push({ id, name: value, members: [] }); changed.set(id, true); this.persist(); this.renderSidebar(); name.value = ''; paint(); });
        const newRow = el('div', 'cl-row'); newRow.append(name, create); popup.body.append(rows, newRow);
        popup.footer.append(button('取消', () => popup.close()), button('应用分组', () => {
            for (const group of this.settings.groups) if (changed.has(group.id)) group.members = changed.get(group.id) ? unique([...group.members, ...ids]) : group.members.filter(id => !ids.includes(id));
            this.persist(); popup.close(); this.renderSidebar(); this.renderList(); this.renderDetail(); this.status('分组已更新。');
        }, { kind: 'cl-primary' }));
    }
    async editDialog(id) {
        const popup = this.popup('快速编辑角色卡', { wide: true }); popup.body.append(paragraph('正在读取最新内容…')); let before;
        try { before = await this.host.getCard(id); } catch (error) { popup.fail(error); return; }
        if (!popup.dialog.open) return;
        const data = cardData(before), controls = {}; popup.body.replaceChildren(paragraph('直接修改角色卡内容。保存只更新改动字段；其他设置和卡内扩展会保留。'));
        const form = el('div', 'cl-edit-form');
        for (const [key, title] of Object.entries(EDIT_FIELDS)) {
            const control = key === 'name' ? input(data[key] || '') : el('textarea', 'cl-input'); control.value = data[key] || ''; if (key !== 'name') control.rows = key === 'description' || key === 'first_mes' ? 8 : 4;
            controls[key] = control; form.append(field(title, control));
        }
        popup.body.append(form);
        const dirty = () => Object.entries(controls).some(([key, node]) => node.value !== (data[key] || ''));
        popup.canClose = () => !dirty() || this.confirm('放弃未保存的修改？', '编辑内容尚未保存到角色卡。', '放弃修改');
        const save = button('保存修改', async () => {
            if (popup.busy) return; popup.busy = true; this.mutating = true; save.disabled = true; popup.error.textContent = '';
            try {
                const { card, warning } = await this.host.saveCard(before, Object.fromEntries(Object.entries(controls).map(([key, node]) => [key, node.value])));
                this.records.set(id, makeRecord(card)); popup.canClose = null; popup.close(); this.status(warning || '角色卡已保存。', Boolean(warning));
                this.renderList(); this.renderDetail();
            } catch (error) { popup.fail(error); }
            finally { popup.busy = false; this.mutating = false; save.disabled = false; if (!popup.dialog.open) await this.refresh(true); }
        }, { kind: 'cl-primary', glyph: 'check' });
        popup.footer.append(button('取消', async () => { if (!popup.busy && await popup.canClose()) popup.close(); }), save);
    }
    deleteDialog(ids) {
        const popup = this.popup(`删除 ${ids.length} 张角色卡`);
        popup.body.append(paragraph('角色卡删除后无法在书库撤销，酒馆会关闭当前聊天。默认保留聊天记录；恢复原文件名的角色卡后可继续读取。', 'cl-prose'));
        const list = el('ul', 'cl-delete-list'); for (const id of ids) list.append(el('li', '', this.records.get(id)?.name || id)); popup.body.append(list);
        const chats = el('input'); chats.type = 'checkbox'; const label = el('label', 'cl-check'); label.append(chats, el('span', '', '同时永久删除这些角色的聊天记录')); popup.body.append(label);
        const acknowledgement = input('', `输入 ${ids.length} 确认数量`); acknowledgement.inputMode = 'numeric'; popup.body.append(field('确认删除数量', acknowledgement));
        const remove = button(`删除 ${ids.length} 张`, async () => {
            if (popup.busy || acknowledgement.value.trim() !== String(ids.length)) return;
            popup.busy = true; this.mutating = true; remove.disabled = true; popup.error.textContent = '';
            try {
                const result = await this.host.deleteCards(ids, chats.checked);
                for (const id of result.deleted) { this.records.delete(id); this.selected.delete(id); delete this.settings.summaries[metaKey(id)]; }
                for (const group of this.settings.groups) group.members = group.members.filter(id => !result.deleted.includes(id));
                this.settings.favorites = this.settings.favorites.filter(id => !result.deleted.includes(id)); this.persist();
                if (result.remaining.length) popup.fail(new Error(`已删除 ${result.deleted.length} 张；${result.remaining.length} 张未删除（可能取消或失败）。请关闭窗口刷新核对。`));
                else { popup.close(); this.status(`已删除 ${result.deleted.length} 张角色卡${chats.checked ? '及对应聊天' : '，聊天记录已保留'}。`); }
            } catch (error) { popup.fail(error); }
            finally { popup.busy = false; this.mutating = false; remove.disabled = true; acknowledgement.value = ''; await this.refresh(true); this.renderDetail(); }
        }, { glyph: 'trash', kind: 'cl-danger' }); remove.disabled = true;
        acknowledgement.addEventListener('input', () => remove.disabled = popup.busy || acknowledgement.value.trim() !== String(ids.length));
        popup.footer.append(button('取消', () => { if (!popup.busy) popup.close(); }), remove);
    }
    async chatDialog(record, chat) {
        const popup = this.popup(chat.file_name.replace(/\.jsonl$/i, ''), { wide: true }); const controller = new AbortController();
        popup.dialog.addEventListener('close', () => controller.abort()); popup.body.append(paragraph('正在读取聊天记录…'));
        try {
            const messages = await this.host.chat(record.card, chat.file_name, controller.signal); if (!popup.dialog.open) return;
            popup.body.replaceChildren(); let visible = 60; let query = '';
            const search = input('', '在本篇聊天中搜索'); search.type = 'search'; search.setAttribute('aria-label', '搜索聊天记录');
            const count = paragraph('', 'cl-footnote'), list = el('div', 'cl-messages'), more = button('显示更早的 60 条', () => { visible += 60; paint(); });
            const paint = () => {
                const found = messages.map((message, index) => ({ message, index })).filter(({ message }) => normalizeText(message.mes || message.content).includes(normalizeText(query)));
                const items = found.slice(-visible); count.textContent = `${messages.length} 条消息${query ? ` · 命中 ${found.length} 条` : ''} · 显示 ${items.length} 条`;
                more.hidden = found.length <= visible; list.replaceChildren();
                for (const { message, index } of items) {
                    const node = el('article', `cl-message${message.is_user ? ' cl-user-message' : ''}`); node.append(el('div', 'cl-message-label', `${index + 1} · ${message.name || (message.role === 'tool' ? '工具' : message.is_user ? '用户' : record.name)}`), textBlock(message.mes || message.content)); list.append(node);
                }
                if (!items.length) list.append(empty('没有找到消息', '试试其他关键词。', 'search'));
            };
            search.addEventListener('input', () => { query = search.value; visible = 60; paint(); }); popup.body.append(search, count, more, list); paint();
            popup.footer.append(button('关闭预览', () => popup.close()));
        } catch (error) { if (popup.dialog.open) popup.fail(error); }
    }
    async aiDialog(id) {
        const popup = this.popup('AI 概括与分类', { wide: true }); popup.body.append(paragraph('正在准备卡片资料…'));
        let card;
        try { card = await this.host.getCard(id); } catch (error) { popup.fail(error); return; }
        if (!popup.dialog.open) return;
        const prepared = classificationInput(card), destination = paragraph('');
        const updateDestination = () => {
            const ai = normalizeApiConfig(this.settings.ai);
            destination.textContent = `将「${cardData(card).name}」的人设、性格、场景、主开场白、作者备注和内嵌世界书发送到${ai.source === 'custom' ? `额外 API：${ai.url} · ${ai.model}` : '酒馆当前 API'}。不会附带聊天记录。${prepared.truncated ? '较长字段已截取。' : ''}`;
        };
        updateDestination();
        const configure = button('配置 AI / 额外 API', () => this.apiSettingsDialog(updateDestination));
        popup.body.replaceChildren(destination, configure);
        const details = el('details', 'cl-world-entry'); details.append(el('summary', '', `查看将发送的资料 · ${prepared.input.length} 字符`), textBlock(prepared.input)); popup.body.append(details);
        const output = el('div', 'cl-ai-output'); popup.body.append(output);
        const showResult = result => {
                output.replaceChildren(paragraph('概括与类型已自动保存。关闭窗口后仍可在此继续查看和修改。', 'cl-footnote')); const summary = el('textarea', 'cl-input'); summary.rows = 5; summary.value = result.summary;
                const types = input(result.types.join('，')); output.append(field('概括（可修改）', summary), field('类型（用逗号分隔）', types));
                const save = group => {
                    if (!summary.value.trim()) return popup.fail(new Error('概括不能为空。'));
                    const typeNames = unique(types.value.split(/[,，\n]/).map(value => value.trim().slice(0, 30))).slice(0, 5);
                    if (!typeNames.length) return popup.fail(new Error('请至少保留一个类型。'));
                    if (!this.host.cards().some(item => item.avatar === id)) return popup.fail(new Error('角色卡已移除，无法保存分类。'));
                    this.settings.summaries[metaKey(id)] = { ...result, summary: summary.value.trim().slice(0, 800), types: typeNames };
                    if (group) for (const name of typeNames) {
                        let target = this.settings.groups.find(item => normalizeText(item.name) === normalizeText(name));
                        if (!target) { target = { id: `g-${crypto.randomUUID()}`, name, members: [] }; this.settings.groups.push(target); }
                        target.members = unique([...target.members, id]);
                    }
                    this.persist(); popup.close(); this.renderSidebar(); this.renderList(); this.renderDetail(); this.status('AI 概括已保存。');
                };
                popup.footer.replaceChildren(button('重新生成', () => generate.click()), button('保存修改', () => save(false)), button('保存修改并按类型分组', () => save(true), { kind: 'cl-primary' }));
        };
        const generate = button('生成概括', async () => {
            generate.disabled = true; configure.disabled = true; popup.footer.replaceChildren(generate); popup.error.textContent = '';
            output.replaceChildren(paragraph('正在概括。可以关闭此窗口，成功后会自动保存；请保持酒馆页面打开。'));
            try {
                const { result } = await this.host.classify(card);
                if (this.dialog?.open) { this.renderSidebar(); this.renderList(); this.renderDetail(); this.status(`「${cardData(card).name}」的 AI 概括已自动保存。`); }
                if (popup.dialog.open) showResult(result);
            } catch (error) {
                if (popup.dialog.open) {
                    popup.fail(error); output.replaceChildren();
                    if (error.raw) output.append(textBlock(error.raw));
                    const saved = this.settings.summaries[metaKey(id)];
                    if (saved) output.append(button('查看已保存的概括', () => showResult(saved)));
                } else if (this.dialog?.open) this.status(`「${cardData(card).name}」概括失败：${notifyText(error)}`, true);
            } finally { generate.disabled = false; configure.disabled = false; }
        }, { glyph: 'spark', kind: 'cl-primary' });
        const saved = this.settings.summaries[metaKey(id)];
        if (saved) showResult(saved); else popup.footer.append(generate);
    }
    preferences() {
        const popup = this.popup('书库设置与整理数据');
        popup.body.append(field('外观', select('外观', [['auto', '跟随酒馆明暗'], ['light', '浅色'], ['dark', '深色']], this.settings.theme, value => { this.settings.theme = value; this.persist(); this.applyTheme(); })));
        popup.body.append(el('h3', '', 'AI 概括'), button('配置 AI / 额外 API', () => this.apiSettingsDialog(), { glyph: 'spark' }), paragraph('支持跟随当前连接，或使用独立的 OpenAI 兼容 API。概括成功后自动保存。'));
        popup.body.append(el('h3', '', '分组迁移与备份'), paragraph('导出独立分组、收藏和 AI 概括。文件不包含角色卡本体或聊天；跨设备迁移时需保留相同的卡片文件名。'));
        popup.body.append(button('导出整理数据', async () => {
            try { await this.host.exportLibrary(`角色书库-整理数据-${new Date().toISOString().slice(0, 10)}.json`, { format: 'card-library', version: 1, settings: exportSettings(this.settings) }); }
            catch (error) { popup.fail(error); }
        }, { glyph: 'folder' }));
        const upload = el('input', 'cl-input'); upload.type = 'file'; upload.accept = '.json,application/json';
        upload.addEventListener('change', async () => {
            const file = upload.files?.[0]; if (!file) return;
            try {
                if (file.size > 5 * 1024 * 1024) throw new Error('整理数据不能超过 5 MB。');
                const raw = JSON.parse(await file.text()); const next = importLibrary(raw, this.settings);
                if (!await this.confirm('合并整理数据', `将合并 ${raw.settings.groups.length} 个分组和收藏、AI 概括。同名分组会合并，不删除现有分组。`, '合并')) return;
                this.host.saveSettings(next); this.renderSidebar(); this.renderList(); this.renderDetail(); popup.close(); this.status('整理数据已合并。');
            } catch (error) { popup.fail(error); } finally { upload.value = ''; }
        }); popup.body.append(field('导入整理数据', upload));
        const mobile = el('div', 'cl-mobile-only'); mobile.append(button('管理当前分组', () => { popup.close(); this.groupEditor(this.settings.groups.find(item => item.id === this.group)?.id); }, { glyph: 'folder' })); popup.body.append(mobile);
        popup.footer.append(button('完成', () => popup.close(), { kind: 'cl-primary' }));
    }
    apiSettingsDialog(onSaved = () => {}) {
        const popup = this.popup('AI 与额外 API');
        const current = normalizeApiConfig(this.settings.ai);
        let draftSecretId = current.secretId;
        const fields = el('div', 'cl-api-fields');
        const source = select('AI 连接', [['current', '使用酒馆当前 API'], ['custom', '使用额外 API（OpenAI 兼容）']], current.source, value => fields.hidden = value !== 'custom');
        const url = input(current.url, 'https://example.com/v1'); url.type = 'url'; url.autocomplete = 'off';
        const model = input(current.model, '填写服务商提供的模型名称'); model.autocomplete = 'off';
        const key = input('', current.secretId ? '已保存；留空保留原密钥' : '填写 API Key；无密钥服务可留空'); key.type = 'password'; key.autocomplete = 'new-password'; key.spellcheck = false;
        const clearLabel = el('label', 'cl-check'), clear = el('input'); clear.type = 'checkbox'; clearLabel.append(clear, el('span', '', '此服务不需要密钥（清除本配置的密钥引用）'));
        clear.addEventListener('change', () => { key.disabled = clear.checked; });
        const ocgNote = paragraph('', 'cl-footnote');
        const updateOcg = () => {
            const endpoint = openCodeEndpoint(url.value);
            ocgNote.hidden = !endpoint;
            ocgNote.textContent = endpoint ? `已内置 OpenCode 适配：补充会话头、修正模型目录，无需另装插件。${endpoint.plan.startsWith('payg') ? '当前地址为按量计费路径。' : '生成保留 Go 路径。'}公共模型目录可能包含套餐外模型。` : '';
        };
        const useGo = button('填入 OpenCode Go 地址', () => { url.value = OPENCODE_GO_URL; invalidateModels(); updateOcg(); });
        const modelPicker = select('可用模型', [], '', value => { if (value) model.value = value; });
        const pickerField = field('可用模型', modelPicker); pickerField.hidden = true;
        const modelStatus = paragraph('', 'cl-footnote');
        const invalidateModels = () => { pickerField.hidden = true; modelStatus.textContent = ''; };
        url.addEventListener('input', () => { invalidateModels(); updateOcg(); }); key.addEventListener('input', invalidateModels); clear.addEventListener('change', invalidateModels);
        const configValue = () => ({ source: source.value, url: url.value, model: model.value, secretId: draftSecretId });
        const credentials = () => ({ newKey: key.value, clearKey: clear.checked });
        const acceptPrepared = config => { draftSecretId = config.secretId; key.value = ''; key.placeholder = '已存入密钥库；留空保留'; clear.checked = false; key.disabled = popup.busy; url.value = config.url; updateOcg(); };
        const fetchModels = button('拉取模型', async () => {
            popup.busy = true; lock(true); popup.error.textContent = ''; modelStatus.textContent = '正在读取模型列表…';
            try {
                const prepared = await this.host.prepareApiConfig({ ...configValue(), source: 'custom' }, credentials());
                acceptPrepared(prepared.config);
                if (prepared.warning) throw new Error(prepared.warning);
                const models = await this.host.apiModels(prepared.config);
                modelPicker.replaceChildren();
                for (const [value, label] of [['', '选择一个模型…'], ...models.map(name => [name, name])]) { const option = el('option', '', label); option.value = value; modelPicker.append(option); }
                modelPicker.value = models.includes(model.value) ? model.value : '';
                pickerField.hidden = false; modelStatus.textContent = `已读取 ${models.length} 个模型。选择后自动填入下方；也可手动填写。`;
                modelPicker.focus();
            } catch (error) { modelStatus.textContent = '拉取未完成，仍可手动填写模型名称。'; popup.fail(error); }
            finally { popup.busy = false; lock(false); }
        }, { glyph: 'refresh' });
        fields.append(field('API 基础地址', url, '通常以 /v1 结尾；粘贴 /chat/completions 完整地址也会自动整理。'), useGo, ocgNote, field('API Key', key, '拉取模型或保存设置时存入酒馆密钥库，不进入整理数据导出。'), clearLabel, fetchModels, modelStatus, pickerField, field('模型', model));
        updateOcg();
        fields.hidden = current.source !== 'custom';
        popup.body.append(field('AI 连接', source), fields, paragraph('额外 API 仅用于书库概括。拉取模型只读取目录；连接配置点击保存后生效。已存入密钥库的密钥可在酒馆密钥管理中维护。', 'cl-footnote'));
        const save = button('保存 API 设置', async () => {
            popup.busy = true; lock(true); popup.error.textContent = '';
            try {
                const result = await this.host.saveApiConfig(configValue(), credentials());
                acceptPrepared(result.config);
                onSaved();
                if (result.warning) popup.fail(new Error(result.warning)); else { popup.close(); this.status('AI 设置已保存。'); }
            } catch (error) { popup.fail(error); }
            finally { popup.busy = false; lock(false); }
        }, { kind: 'cl-primary' });
        const lock = busy => { for (const node of [source, url, model, key, clear, useGo, fetchModels, modelPicker, save]) node.disabled = busy; if (!busy) key.disabled = clear.checked; };
        popup.dialog.addEventListener('close', () => { key.value = ''; });
        popup.footer.append(button('取消', () => { if (!popup.busy) popup.close(); }), save);
    }
}

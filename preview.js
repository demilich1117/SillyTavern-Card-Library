import { cardData, text } from './core.js';

// Preview binds card/persona macros without invoking the host's chat-state or
// variable macros. Opening a library preview must never change a live chat.
export function previewMacros(value, card, user = '你', escape = false) {
    const data = cardData(card);
    const values = { char: data.name, user, description: data.description, personality: data.personality, scenario: data.scenario, charprompt: data.system_prompt };
    return text(value).replace(/{{(char|user|description|personality|scenario|charprompt)}}/gi, (match, key) => {
        const result = text(values[key.toLowerCase()]);
        return escape ? result.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&').replace(/\n/g, '\\n').replace(/\r/g, '\\r') : result;
    });
}

export function processOpening(raw, scripts, card, user, compile) {
    let value = text(raw), applied = 0;
    const warnings = [];
    // Match the host's stored-message pass followed by its display pass.
    for (const display of [false, true]) {
        for (const rule of scripts) {
            if (!rule || rule.disabled || !rule.findRegex || !rule.placement?.includes(2)) continue;
            if (display ? !rule.markdownOnly : rule.markdownOnly || rule.promptOnly) continue;
            // First-message creation has no depth; display is depth zero.
            if (display && ((rule.minDepth != null && rule.minDepth >= -1 && 0 < Number(rule.minDepth)) || (rule.maxDepth != null && rule.maxDepth >= 0 && 0 > Number(rule.maxDepth)))) continue;
            try {
                const mode = Number(rule.substituteRegex || 0);
                const expression = mode ? previewMacros(rule.findRegex, card, user, mode === 2) : rule.findRegex;
                const regex = compile(expression);
                if (!regex) { warnings.push(`正则「${rule.scriptName || '未命名'}」无法解析`); continue; }
                regex.lastIndex = 0;
                value = value.replace(regex, (...args) => {
                    const replacement = text(rule.replaceString).replace(/{{match}}/gi, '$0').replace(/\$(\d+)|\$<([^>]+)>/g, (_, number, name) => {
                        const last = args.at(-1), groups = typeof last === 'object' ? last : {};
                        const captures = args.slice(0, typeof last === 'object' ? -3 : -2);
                        let capture = text(name ? groups[name] : captures[Number(number)]);
                        for (const trim of rule.trimStrings || []) capture = capture.split(previewMacros(trim, card, user)).join('');
                        return capture;
                    });
                    return previewMacros(replacement, card, user);
                });
                applied++;
            } catch { warnings.push(`正则「${rule.scriptName || '未命名'}」处理失败`); }
        }
    }
    return { processed: previewMacros(value, card, user), applied, warnings };
}

export function renderOpening(processed, libs) {
    if (!libs?.DOMPurify?.sanitize || !libs?.showdown?.Converter) throw new Error('当前宿主缺少阅读预览组件，请切换原文查看。');
    // HTML frontends are often delivered inside fenced blocks for the helper.
    const readable = processed.replace(/```([^\r\n`]*)\r?\n([\s\S]*?)```/g, (block, language, body) => {
        const kind = language.trim().toLowerCase();
        const html = /^(?:html|htm)$/.test(kind) || (!kind && /^\s*(?:<!doctype\s+html\b|<html\b|<(?:style|div|main|section|article|header)\b)/i.test(body));
        return html ? body : block;
    });
    const converter = new libs.showdown.Converter({ tables: true, strikethrough: true, simpleLineBreaks: true });
    const html = libs.DOMPurify.sanitize(converter.makeHtml(readable), {
        FORCE_BODY: true, ADD_TAGS: ['style'], FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'form', 'input', 'textarea', 'meta', 'base', 'link'],
        FORBID_ATTR: ['autofocus'], ADD_ATTR: ['target'],
    });
    const doc = new DOMParser().parseFromString(html, 'text/html');
    doc.querySelectorAll('style,script').forEach(node => node.remove());
    const plain = doc.body.textContent.replace(/\s+/g, ' ').trim();
    return { html, plain };
}

export function previewDocument(html, dark = false) {
    return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'none'; style-src 'unsafe-inline'; img-src https: http: data: blob:; font-src data:; connect-src 'none'; form-action 'none'; base-uri 'none'"><style>html{color-scheme:${dark ? 'dark' : 'light'}}body{margin:16px;font:15px/1.8 system-ui,sans-serif;color:${dark ? '#eee' : '#222'};overflow-wrap:anywhere}img,video,svg{max-width:100%;height:auto}pre{white-space:pre-wrap}table{max-width:100%;border-collapse:collapse}td,th{padding:6px;border:1px solid #8885}blockquote{margin:12px 0;padding-left:12px;border-left:3px solid #999}a{color:${dark ? '#f0adad' : '#900'}}</style></head><body>${html}</body></html>`;
}

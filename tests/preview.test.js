import test from 'node:test';
import assert from 'node:assert/strict';
import { processOpening, previewMacros } from '../preview.js';
import { createHost } from '../host.js';

const compile = expression => { const parts = expression.match(/^\/(.*)\/([a-z]*)$/s); return parts ? new RegExp(parts[1], parts[2]) : new RegExp(expression); };
const card = { avatar: 'target.png', data: { name: '目标角色+', first_mes: 'A', extensions: { regex_scripts: [] } } };
const rule = (find, replace, props = {}) => ({ placement: [2], findRegex: find, replaceString: replace, ...props });

test('preview applies stored and display passes with disabled, prompt-only, depth and capture handling', () => {
    const rules = [rule('A', 'B'), rule('B', 'C', { markdownOnly: true }), rule('C', 'wrong', { promptOnly: true }), rule('C', 'wrong', { markdownOnly: true, minDepth: 1 }), rule('C', 'wrong', { disabled: true }), rule('(C)', '<b>{{char}} $1 {{match}}</b>', { markdownOnly: true })];
    assert.equal(processOpening('A', rules, card, '读者', compile).processed, '<b>目标角色+ C C</b>');
});

test('preview uses safe target macros, named captures and trimming without evaluating chat-variable macros', () => {
    const result = processOpening('目标角色+ 标记内容', [rule('/{{char}} (?<value>.*)/', '{{user}}：$<value>{{setvar::x::1}}', { substituteRegex: 2, trimStrings: ['标记'] })], card, '读者', compile);
    assert.equal(result.processed, '读者：内容{{setvar::x::1}}');
    assert.equal(previewMacros('{{CHAR}} / {{user}}', card, '读者'), '目标角色+ / 读者');
});

test('preview tolerates invalid regex and handles repeated global matches', () => {
    const result = processOpening('aa', [rule('/[/', ''), rule('/a/g', 'b', { markdownOnly: true })], card, '你', compile);
    assert.equal(result.processed, 'bb'); assert.equal(result.warnings.length, 1);
});

test('host selects target scopes in global / preset / character order without selecting live character', async () => {
    const target = structuredClone(card); target.data.extensions.regex_scripts = [rule('C', '<b>目标</b>', { markdownOnly: true })];
    let allowed = true;
    const ctx = { name1: '读者', characterId: 33, extensionSettings: {} };
    const engine = { SCRIPT_TYPES: { GLOBAL: 0, PRESET: 2, SCOPED: 1 }, RegexProvider: { instance: { get: compile } }, isScopedScriptsAllowed: c => c.avatar === target.avatar && allowed, getScriptsByType: type => { assert.notEqual(type, 1); return type === 0 ? [rule('A', 'B', { markdownOnly: true })] : [rule('B', 'C', { markdownOnly: true })]; } };
    const host = createHost({ getContext: () => ctx, loadModule: async () => engine });
    assert.equal((await host.opening(target)).processed, '<b>目标</b>'); assert.equal(ctx.characterId, 33);
    allowed = false;
    assert.equal((await host.opening(target)).processed, 'C'); assert.match((await host.opening(target)).warnings.join(), /尚未/);
    ctx.extensionSettings.disabledExtensions = ['regex'];
    assert.equal((await host.opening(target)).processed, 'A');
});

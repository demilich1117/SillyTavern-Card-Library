export const SCRIPT_TYPES = { GLOBAL: 0, PRESET: 2, SCOPED: 1 };
export const getScriptsByType = () => [];
export const isScopedScriptsAllowed = card => window.SillyTavern.getContext().extensionSettings.character_allowed_regex.includes(card.avatar);
export const RegexProvider = { instance: { get: source => { const parts = source.match(/^\/(.*)\/([a-z]*)$/s); return parts ? new RegExp(parts[1], parts[2]) : new RegExp(source); } } };

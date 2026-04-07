// Core API — central hub for cross-module communication and shared utilities

const EXTENSION_NAME = 'chub-library';
const SETTINGS_KEY = 'ChubLibrary';

// ========================================
// STATE ACCESS
// ========================================

let _context = null;
let _settings = {};
let _characters = [];

/**
 * Get SillyTavern context
 * @returns {Object|null}
 */
export function getContext() {
    if (!_context) {
        try {
            _context = window.SillyTavern?.getContext?.() || null;
        } catch {
            _context = null;
        }
    }
    return _context;
}

/**
 * Set context (called during init)
 * @param {Object} ctx
 */
export function setContext(ctx) {
    _context = ctx;
}

/**
 * Get all local characters
 * @returns {Array}
 */
export function getAllCharacters() {
    const ctx = getContext();
    return ctx?.characters || [];
}

/**
 * Get extension settings
 * @param {string} key
 * @returns {*}
 */
export function getSetting(key) {
    return _settings[key];
}

/**
 * Set extension setting
 * @param {string} key
 * @param {*} value
 */
export function setSetting(key, value) {
    _settings[key] = value;
    saveSettings();
}

/**
 * Batch set settings
 * @param {Object} obj
 */
export function setSettings(obj) {
    Object.assign(_settings, obj);
    saveSettings();
}

/**
 * Load settings from SillyTavern
 */
export function loadSettings() {
    const ctx = getContext();
    if (ctx?.extensionSettings?.[SETTINGS_KEY]) {
        _settings = { ...getDefaultSettings(), ...ctx.extensionSettings[SETTINGS_KEY] };
    } else {
        _settings = { ...getDefaultSettings() };
    }
    return _settings;
}

/**
 * Save settings to SillyTavern
 */
export function saveSettings() {
    const ctx = getContext();
    if (ctx?.extensionSettings) {
        if (!ctx.extensionSettings[SETTINGS_KEY]) {
            ctx.extensionSettings[SETTINGS_KEY] = {};
        }
        ctx.extensionSettings[SETTINGS_KEY] = { ..._settings };
        if (typeof ctx.saveSettingsDebounced === 'function') {
            ctx.saveSettingsDebounced();
        }
    }
}

/**
 * Get default settings
 * @returns {Object}
 */
export function getDefaultSettings() {
    return {
        nsfw: false,
        nsfl: false,
        sort: 'default',
        searchInName: true,
        searchInTags: true,
        searchInCreator: false,
        hideOwned: false,
        cardsPerRow: 3,
        infiniteScroll: true,
        debugMode: false,
    };
}

// ========================================
// UI HELPERS
// ========================================

/**
 * Show toast notification
 * @param {string} message
 * @param {string} type - 'success' | 'error' | 'info' | 'warning'
 * @param {number} duration
 */
export function showToast(message, type = 'info', duration = 3000) {
    try {
        if (window.toastr) {
            switch (type) {
                case 'success': toastr.success(message); break;
                case 'error': toastr.error(message); break;
                case 'warning': toastr.warning(message); break;
                default: toastr.info(message);
            }
        } else {
            console.log(`[${type.toUpperCase()}] ${message}`);
        }
    } catch {
        console.log(`[${type.toUpperCase()}] ${message}`);
    }
}

/**
 * Escape HTML to prevent XSS
 * @param {string} text
 * @returns {string}
 */
export function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

/**
 * Debounce function
 * @param {Function} fn
 * @param {number} delay
 * @returns {Function}
 */
export function debounce(fn, delay = 250) {
    let timer;
    return (...args) => {
        clearTimeout(timer);
        timer = setTimeout(() => fn(...args), delay);
    };
}

/**
 * Truncate string
 * @param {string} str
 * @param {number} max
 * @returns {string}
 */
export function truncate(str, max = 50) {
    if (!str) return '';
    return str.length <= max ? str : str.slice(0, max - 3) + '...';
}

// ========================================
// API REQUESTS
// ========================================

/**
 * Make API request to SillyTavern server
 * @param {string} endpoint
 * @param {string} method
 * @param {Object} data
 * @returns {Promise<Response>}
 */
export async function apiRequest(endpoint, method = 'GET', data = null) {
    const ctx = getContext();
    const csrfToken = ctx?.csrf_token || '';

    const options = {
        method,
        headers: {
            'Content-Type': 'application/json',
            'X-CSRF-Token': csrfToken,
        },
    };

    if (data && method !== 'GET') {
        options.body = JSON.stringify(data);
    }

    return fetch(`/api${endpoint}`, options);
}

/**
 * Get CSRF token
 * @returns {string}
 */
export function getCsrfToken() {
    const ctx = getContext();
    return ctx?.csrf_token || '';
}

// ========================================
// CHARACTER ACTIONS
// ========================================

/**
 * Import character from Chub.ai URL
 * @param {string} url
 * @returns {Promise<boolean>}
 */
export async function importCharacter(url) {
    const ctx = getContext();
    if (!ctx?.importFromExternalUrl) {
        showToast('Import function not available', 'error');
        return false;
    }

    try {
        await ctx.importFromExternalUrl(url);
        return true;
    } catch (err) {
        console.error('Import error:', err);
        return false;
    }
}

/**
 * Refresh character list
 * @returns {Promise<void>}
 */
export async function refreshCharacters() {
    const ctx = getContext();
    if (ctx?.getCharacters) {
        await ctx.getCharacters();
    }
}

// ========================================
// PROVIDER REGISTRY
// ========================================

const _providers = new Map();
let _activeProviderId = null;

/**
 * Register a provider
 * @param {Object} provider
 */
export function registerProvider(provider) {
    if (provider?.id) {
        _providers.set(provider.id, provider);
        debugLog(`Registered provider: ${provider.name} (${provider.id})`);
    }
}

/**
 * Get all providers
 * @returns {Array}
 */
export function getAllProviders() {
    return [..._providers.values()];
}

/**
 * Get provider by ID
 * @param {string} id
 * @returns {Object|undefined}
 */
export function getProvider(id) {
    return _providers.get(id);
}

/**
 * Get active provider
 * @returns {Object|null}
 */
export function getActiveProvider() {
    return _activeProviderId ? _providers.get(_activeProviderId) || null : null;
}

/**
 * Set active provider
 * @param {string} id
 */
export function setActiveProvider(id) {
    _activeProviderId = id;
}

/**
 * Find provider for a URL
 * @param {string} url
 * @returns {Object|null}
 */
export function getProviderForUrl(url) {
    for (const provider of _providers.values()) {
        if (provider.canHandleUrl?.(url)) return provider;
    }
    return null;
}

// ========================================
// LOGGING
// ========================================

/**
 * Debug log (only when debug mode enabled)
 */
export function debugLog(...args) {
    if (getSetting('debugMode')) {
        console.log(`[${EXTENSION_NAME}]`, ...args);
    }
}

/**
 * Debug warn
 */
export function debugWarn(...args) {
    if (getSetting('debugMode')) {
        console.warn(`[${EXTENSION_NAME}]`, ...args);
    }
}

/**
 * Debug error (always logs)
 */
export function debugError(...args) {
    console.error(`[${EXTENSION_NAME}]`, ...args);
}

// ========================================
// DEFAULT EXPORT
// ========================================

export default {
    // State
    getContext,
    setContext,
    getAllCharacters,
    getSetting,
    setSetting,
    setSettings,
    loadSettings,
    saveSettings,
    getDefaultSettings,

    // UI
    showToast,
    escapeHtml,
    debounce,
    truncate,

    // API
    apiRequest,
    getCsrfToken,

    // Characters
    importCharacter,
    refreshCharacters,

    // Providers
    registerProvider,
    getAllProviders,
    getProvider,
    getActiveProvider,
    setActiveProvider,
    getProviderForUrl,

    // Logging
    debugLog,
    debugWarn,
    debugError,
};

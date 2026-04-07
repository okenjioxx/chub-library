// Provider Registry — manages character source providers

let _providers = new Map();
let _activeProviderId = null;
let _coreAPI = null;

/**
 * Register a provider instance
 * @param {import('../providers/provider-base.js').ProviderBase} provider
 */
export function registerProvider(provider) {
    if (!provider?.id) {
        console.error('[ProviderRegistry] Cannot register provider without id');
        return;
    }
    if (_providers.has(provider.id)) {
        console.warn(`[ProviderRegistry] Provider "${provider.id}" already registered, replacing`);
    }
    _providers.set(provider.id, provider);
    _coreAPI?.debugLog?.(`[ProviderRegistry] Registered provider: ${provider.name} (${provider.id})`);
}

/**
 * Initialize all registered providers
 * @param {Object} api - CoreAPI reference
 */
export async function initProviders(api) {
    _coreAPI = api;
    for (const [id, provider] of _providers) {
        try {
            await provider.init(api);
            _coreAPI?.debugLog?.(`[ProviderRegistry] Initialized provider: ${id}`);
        } catch (err) {
            console.error(`[ProviderRegistry] Failed to init provider "${id}":`, err);
        }
    }
}

/**
 * Get a provider by ID
 * @param {string} id
 * @returns {import('../providers/provider-base.js').ProviderBase|undefined}
 */
export function getProvider(id) {
    return _providers.get(id);
}

/**
 * Get all registered providers
 * @returns {import('../providers/provider-base.js').ProviderBase[]}
 */
export function getAllProviders() {
    return [..._providers.values()];
}

/**
 * Get active provider
 * @returns {import('../providers/provider-base.js').ProviderBase|null}
 */
export function getActiveProvider() {
    return _activeProviderId ? _providers.get(_activeProviderId) ?? null : null;
}

/**
 * Get active provider ID
 * @returns {string|null}
 */
export function getActiveProviderId() {
    return _activeProviderId;
}

/**
 * Set active provider
 * @param {string} providerId
 */
export function setActiveProvider(providerId) {
    _activeProviderId = providerId;
}

/**
 * Find which provider owns a character
 * @param {Object} char
 * @returns {{ provider: import('../providers/provider-base.js').ProviderBase, linkInfo: Object }|null}
 */
export function getCharacterProvider(char) {
    for (const provider of _providers.values()) {
        const linkInfo = provider.getLinkInfo(char);
        if (linkInfo) {
            return { provider, linkInfo };
        }
    }
    return null;
}

/**
 * Get link info for a character from any provider
 * @param {Object} char
 * @returns {Object|null}
 */
export function getLinkInfo(char) {
    return getCharacterProvider(char)?.linkInfo ?? null;
}

/**
 * Find which provider can handle a URL
 * @param {string} url
 * @returns {import('../providers/provider-base.js').ProviderBase|null}
 */
export function getProviderForUrl(url) {
    for (const provider of _providers.values()) {
        if (provider.canHandleUrl?.(url)) return provider;
    }
    return null;
}

export default {
    registerProvider,
    initProviders,
    getProvider,
    getAllProviders,
    getActiveProvider,
    getActiveProviderId,
    setActiveProvider,
    getCharacterProvider,
    getLinkInfo,
    getProviderForUrl,
};

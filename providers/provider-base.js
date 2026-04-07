// Provider Base — abstract interface for character source providers

/**
 * @typedef {Object} ProviderLinkInfo
 * @property {string} providerId - which provider owns this link
 * @property {string|number} id - provider-internal identifier
 * @property {string} fullPath - canonical path on the provider
 */

/**
 * @typedef {Object} ProviderSearchResult
 * @property {string} id
 * @property {string} name
 * @property {string} fullPath
 * @property {string} avatarUrl
 * @property {string} [maxResUrl]
 * @property {number} [rating]
 * @property {number} [starCount]
 * @property {number} [nChats]
 * @property {string[]} [topics]
 * @property {string} [tagline]
 * @property {string} [creator]
 */

/**
 * @typedef {Object} ProviderImportResult
 * @property {boolean} success
 * @property {string} [error]
 * @property {string} [fileName]
 * @property {string} [characterName]
 */

/**
 * Base class for character source providers.
 * Subclasses MUST implement methods marked @abstract.
 */
export class ProviderBase {
    // ── Identity ────────────────────────────────────────────

    /** Unique machine key (e.g. 'chub'). @abstract @returns {string} */
    get id() { throw new Error('Provider must implement get id()'); }

    /** Human display name (e.g. 'ChubAI'). @abstract @returns {string} */
    get name() { throw new Error('Provider must implement get name()'); }

    /** Font Awesome icon class. @returns {string} */
    get icon() { return 'fa-solid fa-globe'; }

    /** Whether this provider has a browsable view. @returns {boolean} */
    get hasView() { return true; }

    // ── Lifecycle ───────────────────────────────────────────

    /**
     * Called once when the provider is registered.
     * @param {Object} coreAPI
     */
    async init(coreAPI) {
        this._coreAPI = coreAPI;
    }

    /**
     * Called when the provider's view is activated.
     * @param {HTMLElement} container
     * @param {Object} [options]
     */
    async activate(container, options = {}) { /* optional */ }

    /**
     * Called when the provider's view is deactivated.
     */
    deactivate() { /* optional */ }

    // ── Character Linking ───────────────────────────────────

    /**
     * Inspect a character and return link info if this provider recognizes it.
     * @param {Object} char
     * @returns {ProviderLinkInfo|null}
     */
    getLinkInfo(char) { return null; }

    /**
     * Write link metadata onto a character object.
     * @param {Object} char
     * @param {ProviderLinkInfo|null} linkInfo
     */
    setLinkInfo(char, linkInfo) { /* optional */ }

    /**
     * Get the URL for viewing a character on this provider.
     * @param {ProviderLinkInfo} linkInfo
     * @returns {string|null}
     */
    getCharacterUrl(linkInfo) { return null; }

    // ── Search & Browse ─────────────────────────────────────

    /**
     * Search for characters on this provider.
     * @abstract
     * @param {Object} params - Search parameters
     * @returns {Promise<{ results: ProviderSearchResult[], hasMore: boolean }>}
     */
    async search(params) { return { results: [], hasMore: false }; }

    /**
     * Fetch tags from this provider.
     * @param {string} query
     * @returns {Promise<Array<{name: string, count: number}>>}
     */
    async fetchTags(query) { return []; }

    // ── Import ──────────────────────────────────────────────

    /**
     * Whether this provider supports URL-based import.
     * @returns {boolean}
     */
    get supportsImport() { return false; }

    /**
     * Test whether a URL belongs to this provider.
     * @param {string} url
     * @returns {boolean}
     */
    canHandleUrl(url) { return false; }

    /**
     * Parse a URL into a provider-specific identifier.
     * @param {string} url
     * @returns {string|null}
     */
    parseUrl(url) { return null; }

    /**
     * Import a character from this provider.
     * @param {string} identifier
     * @returns {Promise<ProviderImportResult>}
     */
    async importCharacter(identifier) {
        return { success: false, error: 'Provider does not support import' };
    }

    // ── Update Checking ─────────────────────────────────────

    /**
     * Whether this provider supports update checking.
     * @returns {boolean}
     */
    get supportsUpdates() { return false; }

    /**
     * Check for updates to a linked character.
     * @param {Object} char
     * @param {ProviderLinkInfo} linkInfo
     * @returns {Promise<{hasUpdate: boolean, remoteCard: Object|null}>}
     */
    async checkForUpdate(char, linkInfo) {
        return { hasUpdate: false, remoteCard: null };
    }

    // ── Version History ─────────────────────────────────────

    /**
     * Whether this provider supports version history.
     * @returns {boolean}
     */
    get supportsVersionHistory() { return false; }

    /**
     * Fetch version history for a character.
     * @param {ProviderLinkInfo} linkInfo
     * @returns {Promise<Array<{ref: string, date: string, message: string}>>}
     */
    async fetchVersionHistory(linkInfo) { return []; }

    // ── Gallery Download ────────────────────────────────────

    /**
     * Whether this provider has downloadable gallery images.
     * @returns {boolean}
     */
    get supportsGallery() { return false; }

    /**
     * Fetch gallery images for a character.
     * @param {ProviderLinkInfo} linkInfo
     * @returns {Promise<Array<{url: string, nsfw?: boolean}>>}
     */
    async fetchGalleryImages(linkInfo) { return []; }

    // ── Authentication ──────────────────────────────────────

    /**
     * Whether this provider supports authentication.
     * @returns {boolean}
     */
    get hasAuth() { return false; }

    /**
     * Whether the user is currently authenticated.
     * @returns {boolean}
     */
    get isAuthenticated() { return false; }

    /**
     * Open authentication UI.
     */
    openAuthUI() { /* optional */ }

    /**
     * Get auth headers for API requests.
     * @returns {Object}
     */
    getAuthHeaders() { return {}; }

    // ── Settings ────────────────────────────────────────────

    /**
     * Return setting descriptors for the settings panel.
     * @returns {Array<{key: string, label: string, type: string, default: *}>}
     */
    getSettings() { return []; }
}

export default ProviderBase;

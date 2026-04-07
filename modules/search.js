// Search Module — handles character search, filtering, and sorting with infinite scroll

import * as CoreAPI from './core-api.js';
import * as ProviderRegistry from './provider-registry.js';
import * as Cache from '../utils/cache.js';
import * as Retry from '../utils/retry.js';

// State
let _searchQuery = '';
let _selectedTags = [];
let _sortOrder = 'default';
let _nsfw = false;
let _nsfl = false;
let _hideOwned = false;
let _currentPage = 1;
let _results = [];
let _hasMore = false;
let _isLoading = false;
let _error = null;

// Tag state
let _tagAutocompleteResults = [];
let _tagSearchTimer = null;

// Infinite scroll state
let _infiniteScrollEnabled = true;
let _scrollHandler = null;
let _$scrollContainer = null;

/**
 * Get current search state
 * @returns {Object}
 */
export function getState() {
    return {
        query: _searchQuery,
        tags: _selectedTags,
        sort: _sortOrder,
        nsfw: _nsfw,
        nsfl: _nsfl,
        hideOwned: _hideOwned,
        page: _currentPage,
        results: _results,
        hasMore: _hasMore,
        isLoading: _isLoading,
        error: _error,
    };
}

/**
 * Update search state
 * @param {Object} updates
 */
export function updateState(updates) {
    if (updates.query !== undefined) _searchQuery = updates.query;
    if (updates.tags !== undefined) _selectedTags = updates.tags;
    if (updates.sort !== undefined) _sortOrder = updates.sort;
    if (updates.nsfw !== undefined) _nsfw = updates.nsfw;
    if (updates.nsfl !== undefined) _nsfl = updates.nsfl;
    if (updates.hide_owned !== undefined) _hideOwned = updates.hide_owned;
    if (updates.page !== undefined) _currentPage = updates.page;
}

/**
 * Generate cache key for search params
 * @returns {string}
 */
function _getCacheKey() {
    return JSON.stringify({
        q: _searchQuery,
        t: _selectedTags,
        s: _sortOrder,
        nsfw: _nsfw,
        nsfl: _nsfl,
        hide: _hideOwned,
        p: _currentPage,
    });
}

/**
 * Perform search with current state
 * @param {Object} options
 * @param {boolean} options.reset - Reset to page 1
 * @param {boolean} options.append - Append results instead of replacing
 * @param {boolean} options.useCache - Use cached results if available
 * @returns {Promise<Object>}
 */
export async function performSearch(options = {}) {
    if (_isLoading) return { results: _results, hasMore: _hasMore, error: _error };

    const { reset = false, append = false, useCache = true } = options;

    if (reset) {
        _currentPage = 1;
        _results = [];
        _error = null;
    }

    _isLoading = true;
    _error = null;

    const provider = ProviderRegistry.getActiveProvider();
    if (!provider) {
        CoreAPI.debugError('No active provider');
        _isLoading = false;
        _error = 'No active provider';
        return { results: [], hasMore: false, error: _error };
    }

    // Check cache
    const cacheKey = _getCacheKey();
    if (useCache && Cache.has(cacheKey)) {
        const cached = Cache.get(cacheKey);
        _results = cached.results;
        _hasMore = cached.hasMore;
        _isLoading = false;
        return { results: _results, hasMore: _hasMore, error: null, cached: true };
    }

    try {
        // Use retry utility with exponential backoff
        const result = await Retry.withRetry(
            () => provider.search({
                query: _searchQuery,
                page: _currentPage,
                first: 48,
                sort: _sortOrder,
                nsfw: _nsfw,
                nsfl: _nsfl,
                topics: _selectedTags,
                hideOwned: _hideOwned,
            }),
            {
                maxRetries: 2,
                baseDelay: 1000,
                maxDelay: 5000,
                shouldRetry: Retry.isNetworkError,
            }
        );

        if (result.error) {
            CoreAPI.showToast(`Search failed: ${result.error}`, 'error');
            _error = result.error;
            _isLoading = false;
            return { results: [], hasMore: false, error: result.error };
        }

        if (append) {
            _results = [..._results, ...result.results];
        } else {
            _results = result.results;
        }

        _hasMore = result.hasMore;
        _isLoading = false;

        // Cache results
        Cache.set(cacheKey, { results: _results, hasMore: _hasMore });

        return { results: _results, hasMore: _hasMore, error: null };
    } catch (err) {
        CoreAPI.debugError('Search error:', err);
        _error = err.message;
        _isLoading = false;
        return { results: [], hasMore: false, error: err.message };
    }
}

/**
 * Load more results (for infinite scroll)
 * @returns {Promise<Object>}
 */
export async function loadMore() {
    if (!_hasMore || _isLoading) return { results: _results, hasMore: _hasMore };
    _currentPage++;
    return performSearch({ append: true });
}

/**
 * Fetch tag autocomplete results
 * @param {string} query
 * @returns {Promise<Array<{name: string, count: number}>>}
 */
export async function fetchTagSuggestions(query) {
    if (!query) return [];

    const cacheKey = `tags:${query}`;
    if (Cache.has(cacheKey)) {
        return Cache.get(cacheKey);
    }

    const provider = ProviderRegistry.getActiveProvider();
    if (!provider?.fetchTags) return [];

    try {
        const results = await provider.fetchTags(query);
        Cache.set(cacheKey, results);
        return results;
    } catch {
        return [];
    }
}

/**
 * Debounced tag search
 * @param {string} query
 * @param {Function} callback
 */
export function debouncedTagSearch(query, callback) {
    clearTimeout(_tagSearchTimer);
    _tagSearchTimer = setTimeout(async () => {
        const results = await fetchTagSuggestions(query);
        callback(results);
    }, 250);
}

/**
 * Setup infinite scroll handler
 * @param {jQuery} $container - Scroll container element
 * @param {Function} onLoadMore - Callback when more results needed
 */
export function setupInfiniteScroll($container, onLoadMore) {
    if (!_infiniteScrollEnabled) return;

    _$scrollContainer = $container;

    // Remove existing handler
    if (_scrollHandler) {
        _$scrollContainer.off('scroll', _scrollHandler);
    }

    _scrollHandler = CoreAPI.debounce(() => {
        if (!_hasMore || _isLoading) return;

        const el = _$scrollContainer[0];
        if (!el) return;

        // Check if scrolled near bottom (within 200px)
        const scrollTop = el.scrollTop || el.pageYOffset;
        const scrollHeight = el.scrollHeight;
        const clientHeight = el.clientHeight;

        if (scrollTop + clientHeight >= scrollHeight - 200) {
            onLoadMore();
        }
    }, 150);

    _$scrollContainer.on('scroll', _scrollHandler);
}

/**
 * Remove infinite scroll handler
 */
export function removeInfiniteScroll() {
    if (_scrollHandler && _$scrollContainer) {
        _$scrollContainer.off('scroll', _scrollHandler);
        _scrollHandler = null;
        _$scrollContainer = null;
    }
}

/**
 * Set infinite scroll enabled
 * @param {boolean} enabled
 */
export function setInfiniteScroll(enabled) {
    _infiniteScrollEnabled = enabled;
}

/**
 * Reset search state
 */
export function reset() {
    _searchQuery = '';
    _selectedTags = [];
    _sortOrder = 'default';
    _nsfw = false;
    _nsfl = false;
    _hideOwned = false;
    _currentPage = 1;
    _results = [];
    _hasMore = false;
    _isLoading = false;
    _error = null;
    removeInfiniteScroll();
}

export default {
    getState,
    updateState,
    performSearch,
    loadMore,
    fetchTagSuggestions,
    debouncedTagSearch,
    setupInfiniteScroll,
    removeInfiniteScroll,
    setInfiniteScroll,
    reset,
};

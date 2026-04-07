// Cache Module — computation caching with TTL and size limits

const CACHE_MAX_SIZE = 500;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

const _cache = new Map();

/**
 * Get cached value if exists and not expired
 * @param {string} key
 * @returns {*|undefined}
 */
export function get(key) {
    const entry = _cache.get(key);
    if (entry && Date.now() - entry.time < CACHE_TTL) {
        return entry.value;
    }
    _cache.delete(key);
    return undefined;
}

/**
 * Set cached value
 * @param {string} key
 * @param {*} value
 */
export function set(key, value) {
    // Evict oldest entries if cache is full
    if (_cache.size >= CACHE_MAX_SIZE) {
        const firstKey = _cache.keys().next().value;
        _cache.delete(firstKey);
    }
    _cache.set(key, { value, time: Date.now() });
}

/**
 * Check if key exists and is not expired
 * @param {string} key
 * @returns {boolean}
 */
export function has(key) {
    return get(key) !== undefined;
}

/**
 * Delete a cached value
 * @param {string} key
 */
export function del(key) {
    _cache.delete(key);
}

/**
 * Clear entire cache
 */
export function clear() {
    _cache.clear();
}

/**
 * Create a cached version of an async function
 * @param {Function} fn - Async function to cache
 * @param {Function} keyFn - Function to generate cache key from args
 * @returns {Function} Cached version of fn
 */
export function cached(fn, keyFn = null) {
    return async (...args) => {
        const key = keyFn ? keyFn(...args) : JSON.stringify(args);
        const cachedValue = get(key);
        if (cachedValue !== undefined) {
            return cachedValue;
        }
        const result = await fn(...args);
        set(key, result);
        return result;
    };
}

export default {
    get,
    set,
    has,
    del,
    clear,
    cached,
};

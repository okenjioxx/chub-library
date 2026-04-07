// Retry Module — error retry logic with exponential backoff

/**
 * Retry an async function with exponential backoff
 * @param {Function} fn - Async function to retry
 * @param {Object} options
 * @param {number} options.maxRetries - Maximum number of retries (default: 3)
 * @param {number} options.baseDelay - Base delay in ms (default: 1000)
 * @param {number} options.maxDelay - Maximum delay in ms (default: 10000)
 * @param {Function} options.onRetry - Callback on each retry attempt
 * @param {Function} options.shouldRetry - Function to determine if retry should happen
 * @returns {Promise<*>} Result of fn
 */
export async function retry(fn, options = {}) {
    const {
        maxRetries = 3,
        baseDelay = 1000,
        maxDelay = 10000,
        onRetry = null,
        shouldRetry = null,
    } = options;

    let lastError;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            return await fn();
        } catch (err) {
            lastError = err;

            // Check if we should retry
            if (shouldRetry && !shouldRetry(err, attempt)) {
                throw err;
            }

            // If we've exhausted retries, throw the error
            if (attempt >= maxRetries) {
                throw err;
            }

            // Calculate delay with exponential backoff and jitter
            const delay = Math.min(
                baseDelay * Math.pow(2, attempt) + Math.random() * 500,
                maxDelay
            );

            // Call retry callback if provided
            if (onRetry) {
                onRetry(err, attempt + 1, maxRetries, delay);
            }

            // Wait before retrying
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }

    throw lastError;
}

/**
 * Create a retryable version of a function
 * @param {Function} fn - Function to make retryable
 * @param {Object} options - Retry options
 * @returns {Function} Retryable version of fn
 */
export function withRetry(fn, options = {}) {
    return (...args) => retry(() => fn(...args), options);
}

/**
 * Default retry predicate — retries on network errors
 * @param {Error} err
 * @returns {boolean}
 */
export function isNetworkError(err) {
    return (
        err.name === 'TypeError' ||
        err.message?.includes('fetch') ||
        err.message?.includes('network') ||
        err.message?.includes('ENOTFOUND') ||
        err.message?.includes('ECONNREFUSED') ||
        err.message?.includes('ETIMEDOUT')
    );
}

export default {
    retry,
    withRetry,
    isNetworkError,
};

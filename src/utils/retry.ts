/** Options for {@link withRetry}. */
export interface RetryOptions {
    /** Max number of attempts (default 3). */
    maxAttempts?: number;
    /** Initial delay in ms before first retry (default 1000). */
    delayMs?: number;
    /** Backoff multiplier between retries (default 2). */
    backoff?: number;
}

const DEFAULT_OPTIONS: Required<RetryOptions> = {
    maxAttempts: 3,
    delayMs: 1000,
    backoff: 2,
};

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Runs an async function with retries on failure.
 * Uses exponential backoff: delayMs, delayMs * backoff, delayMs * backoff^2, ...
 *
 * @param fn - Async function to run (e.g. API fetch).
 * @param options - Retry options (maxAttempts, delayMs, backoff).
 * @returns The result of fn when it succeeds.
 * @throws The last thrown error if all attempts fail.
 */
export async function withRetry<T>(
    fn: () => Promise<T>,
    options?: RetryOptions
): Promise<T> {
    const { maxAttempts, delayMs, backoff } = { ...DEFAULT_OPTIONS, ...options };
    let lastError: unknown;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            return await fn();
        } catch (e) {
            lastError = e;
            if (attempt === maxAttempts) break;
            const wait = delayMs * Math.pow(backoff, attempt - 1);
            await sleep(wait);
        }
    }
    throw lastError;
}

export interface RetryOptions {
    maxAttempts?: number;
    delayMs?: number;
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

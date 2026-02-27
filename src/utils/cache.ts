interface CacheEntry<T> {
    value: T;
    expiresAt: number;
}

const store = new Map<string, CacheEntry<unknown>>();

/**
 * Simple in-memory TTL cache.
 */
export function getCached<T>(key: string): T | undefined {
    const entry = store.get(key) as CacheEntry<T> | undefined;
    if (!entry) return undefined;
    if (Date.now() >= entry.expiresAt) {
        store.delete(key);
        return undefined;
    }
    return entry.value;
}

/**
 * Set cache value with TTL in milliseconds.
 */
export function setCached<T>(key: string, value: T, ttlMs: number): void {
    store.set(key, {
        value,
        expiresAt: Date.now() + ttlMs,
    });
}

/**
 * Remove a key from the cache.
 */
export function invalidateCache(key: string): void {
    store.delete(key);
}

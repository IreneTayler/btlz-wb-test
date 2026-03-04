/**
 * Lightweight job runner for scheduled/background tasks.
 * Provides consistent logging and centralized error handling.
 * Errors are logged and not rethrown so the scheduler can continue with other jobs.
 *
 * @param name - Job name for log prefix (e.g. "wb-tariffs").
 * @param fn - Async function to run (e.g. fetchAndSaveBoxTariffs).
 */
export async function runJob(
    name: string,
    fn: () => Promise<void>
): Promise<void> {
    const startedAt = Date.now();
    console.log(`[Job:${name}] start`);
    try {
        await fn();
        const duration = Date.now() - startedAt;
        console.log(`[Job:${name}] success in ${duration}ms`);
    } catch (error) {
        const duration = Date.now() - startedAt;
        console.error(`[Job:${name}] error after ${duration}ms`, error);
    }
}


import { withRetry } from "#utils/retry.js";

describe("withRetry", () => {
    it("returns result when fn succeeds on first call", async () => {
        const fn = jest.fn().mockResolvedValue(42);
        const result = await withRetry(fn, { maxAttempts: 3 });
        expect(result).toBe(42);
        expect(fn).toHaveBeenCalledTimes(1);
    });

    it("retries on failure and returns when fn succeeds", async () => {
        const fn = jest.fn()
            .mockRejectedValueOnce(new Error("fail"))
            .mockRejectedValueOnce(new Error("fail"))
            .mockResolvedValueOnce("ok");
        const result = await withRetry(fn, { maxAttempts: 3, delayMs: 10 });
        expect(result).toBe("ok");
        expect(fn).toHaveBeenCalledTimes(3);
    });

    it("throws last error when all attempts fail", async () => {
        const err = new Error("final");
        const fn = jest.fn().mockRejectedValue(err);
        await expect(withRetry(fn, { maxAttempts: 2, delayMs: 5 })).rejects.toThrow("final");
        expect(fn).toHaveBeenCalledTimes(2);
    });
});

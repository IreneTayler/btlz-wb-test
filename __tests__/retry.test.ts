import { withRetry } from "../src/utils/retry";

describe("withRetry", () => {
  it("retries on failure and eventually succeeds", async () => {
    let attempts = 0;
    const fn = jest.fn(async () => {
      attempts += 1;
      if (attempts < 3) {
        throw new Error("fail");
      }
      return "ok";
    });

    const result = await withRetry(fn, {
      maxAttempts: 5,
      delayMs: 1,
      backoff: 1,
    });

    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(3);
  });
});


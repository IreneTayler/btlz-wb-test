import { runJob } from "../src/utils/jobs";

describe("runJob", () => {
  it("executes job and does not throw on error", async () => {
    const okJob = jest.fn(async () => {});
    await expect(runJob("ok-job", okJob)).resolves.toBeUndefined();
    expect(okJob).toHaveBeenCalledTimes(1);

    const failingJob = jest.fn(async () => {
      throw new Error("boom");
    });
    await expect(runJob("failing-job", failingJob)).resolves.toBeUndefined();
    expect(failingJob).toHaveBeenCalledTimes(1);
  });
});


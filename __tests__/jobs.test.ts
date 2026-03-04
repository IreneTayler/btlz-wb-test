import { runJob } from "#utils/jobs.js";

describe("runJob", () => {
    it("runs fn and logs start and success", async () => {
        const logSpy = jest.spyOn(console, "log").mockImplementation();
        const fn = jest.fn().mockResolvedValue(undefined);
        await runJob("test-job", fn);
        expect(fn).toHaveBeenCalledTimes(1);
        expect(logSpy).toHaveBeenCalledWith("[Job:test-job] start");
        expect(logSpy).toHaveBeenCalledWith(expect.stringMatching(/\[Job:test-job\] success in \d+ms/));
        logSpy.mockRestore();
    });

    it("catches errors and logs them without rethrowing", async () => {
        const logSpy = jest.spyOn(console, "log").mockImplementation();
        const errSpy = jest.spyOn(console, "error").mockImplementation();
        const err = new Error("job failed");
        const fn = jest.fn().mockRejectedValue(err);
        await expect(runJob("failing", fn)).resolves.not.toThrow();
        expect(errSpy).toHaveBeenCalledWith(expect.stringMatching(/\[Job:failing\] error after \d+ms/), err);
        logSpy.mockRestore();
        errSpy.mockRestore();
    });
});

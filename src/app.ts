import http from "http";
import { migrate, seed } from "#postgres/knex.js";
import { startScheduler } from "#scheduler.js";
import env from "#config/env/env.js";
import { getStatus } from "#services/status.js";

await migrate.latest();
await seed.run();
console.log("Migrations and seeds done.");

startScheduler();
console.log("Scheduler started: hourly WB tariffs fetch, hourly + daily 00:01 Google Sheets sync.");

const port = env.APP_PORT ?? 3000;

const server = http.createServer(async (req, res) => {
    if (!req.url) {
        res.statusCode = 400;
        res.end("Bad Request");
        return;
    }

    if (req.url.startsWith("/healthz") || req.url.startsWith("/status")) {
        try {
            const status = await getStatus();
            const ok = status.db.ok;
            res.statusCode = ok ? 200 : 503;
            res.setHeader("Content-Type", "application/json; charset=utf-8");
            res.end(JSON.stringify(status));
        } catch (error) {
            res.statusCode = 500;
            res.setHeader("Content-Type", "application/json; charset=utf-8");
            res.end(
                JSON.stringify({
                    db: { ok: false, error: "status handler failed" },
                })
            );
        }
        return;
    }

    res.statusCode = 404;
    res.end("Not Found");
});

server.listen(port, () => {
    console.log(`[HTTP] Status server listening on port ${port}`);
});
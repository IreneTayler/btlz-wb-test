import { migrate, seed } from "#postgres/knex.js";
import { startScheduler } from "#scheduler.js";

await migrate.latest();
await seed.run();
console.log("Migrations and seeds done.");

startScheduler();
console.log("Scheduler started: hourly WB tariffs fetch, periodic Google Sheets sync.");
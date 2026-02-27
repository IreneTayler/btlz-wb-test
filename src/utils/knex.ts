import { migrate, seed } from "#postgres/knex.js";
import { Command } from "commander";

// Normalize "migrate:latest" -> "migrate" "latest" so subcommand + action work
const argv = process.argv.slice(2);
const first = argv[0] ?? "";
if (first.includes(":") && !first.startsWith("-")) {
    const [cmd, ...rest] = first.split(":");
    process.argv = [process.argv[0], process.argv[1], cmd, ...rest, ...argv.slice(1)];
}

const program = new Command();

program
    .command("migrate")
    .argument("[type]", "latest|rollback|status|down|up|list|make")
    .argument("[arg]", "version or name")
    .action(async (action, arg) => {
        if (!action) return;
        if (action === "latest") await migrate.latest();
        if (action === "rollback") await migrate.rollback();
        if (action === "down") await migrate.down(arg);
        if (action === "up") await migrate.up(arg);
        if (action === "list") await migrate.list();
        if (action === "make") await migrate.make(arg);
        process.exit(0);
    });
program.command("seed").argument("[action]").argument("[arg]").action(async (action, arg) => {
    if (!action) return;
    if (action === "run") await seed.run();
    if (action === "make") await seed.make(arg);
    process.exit(0);
});
program.parse();

/**
 * @param {import("knex").Knex} knex
 * @returns {Promise<void>}
 */
export async function up(knex) {
    await knex.schema.createTable("box_tariffs", (table) => {
        table.date("tariff_date").primary().comment("Day for which tariffs are stored (date only)");
        table.jsonb("data").notNullable().comment("Array of tariff rows from WB API");
        table.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    });
}

/**
 * @param {import("knex").Knex} knex
 * @returns {Promise<void>}
 */
export async function down(knex) {
    await knex.schema.dropTable("box_tariffs");
}

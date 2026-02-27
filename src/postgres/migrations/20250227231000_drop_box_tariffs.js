/**
 * Drop legacy box_tariffs table (no longer used).
 *
 * @param {import("knex").Knex} knex
 * @returns {Promise<void>}
 */
export async function up(knex) {
    const exists = await knex.schema.hasTable("box_tariffs");
    if (exists) {
        await knex.schema.dropTable("box_tariffs");
    }
}

/**
 * Recreate box_tariffs table in minimal form (for rollback only).
 *
 * @param {import("knex").Knex} knex
 * @returns {Promise<void>}
 */
export async function down(knex) {
    const exists = await knex.schema.hasTable("box_tariffs");
    if (!exists) {
        await knex.schema.createTable("box_tariffs", (table) => {
            table
                .date("tariff_date")
                .primary()
                .comment("Day for which tariffs are stored (legacy)");
            table
                .jsonb("data")
                .notNullable()
                .comment("Legacy payload from WB API");
            table
                .timestamp("updated_at", { useTz: true })
                .notNullable()
                .defaultTo(knex.fn.now());
        });
    }
}


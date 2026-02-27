/**
 * Add typed value columns to box_tariff_item_fields.
 *
 * @param {import("knex").Knex} knex
 * @returns {Promise<void>}
 */
export async function up(knex) {
    await knex.schema.alterTable("box_tariff_item_fields", (table) => {
        table.decimal("value_num", null).nullable();
        table.boolean("value_bool").nullable();
        table.jsonb("value_json").nullable();
    });
}

/**
 * @param {import("knex").Knex} knex
 * @returns {Promise<void>}
 */
export async function down(knex) {
    await knex.schema.alterTable("box_tariff_item_fields", (table) => {
        table.dropColumn("value_num");
        table.dropColumn("value_bool");
        table.dropColumn("value_json");
    });
}


/**
 * Key/value table for all WB fields per box_tariff_item.
 *
 * @param {import("knex").Knex} knex
 * @returns {Promise<void>}
 */
export async function up(knex) {
    await knex.schema.createTable("box_tariff_item_fields", (table) => {
        table.bigIncrements("id").primary();
        table
            .bigInteger("box_tariff_item_id")
            .notNullable()
            .references("id")
            .inTable("box_tariff_items")
            .onDelete("CASCADE");
        table.string("field_key").notNullable();
        table.text("field_value").nullable();
        table.unique(["box_tariff_item_id", "field_key"], {
            indexName: "box_tariff_item_fields_item_key_unique",
        });
        table.index(["box_tariff_item_id"], "box_tariff_item_fields_item_idx");
    });
}

/**
 * @param {import("knex").Knex} knex
 * @returns {Promise<void>}
 */
export async function down(knex) {
    await knex.schema.dropTable("box_tariff_item_fields");
}


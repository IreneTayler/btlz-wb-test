/**
 * @param {import("knex").Knex} knex
 * @returns {Promise<void>}
 */
export async function up(knex) {
    await knex.schema.alterTable("box_tariff_items", (table) => {
        table.dropUnique(["tariff_date", "geo_name", "warehouse_name"], "box_tariff_items_unique_per_day_geo_wh");
    });
}

/**
 * @param {import("knex").Knex} knex
 * @returns {Promise<void>}
 */
export async function down(knex) {
    await knex.schema.alterTable("box_tariff_items", (table) => {
        table.unique(["tariff_date", "geo_name", "warehouse_name"], {
            indexName: "box_tariff_items_unique_per_day_geo_wh",
        });
    });
}


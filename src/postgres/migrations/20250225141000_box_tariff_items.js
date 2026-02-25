/**
 * @param {import("knex").Knex} knex
 * @returns {Promise<void>}
 */
export async function up(knex) {
    await knex.schema.createTable("box_tariff_items", (table) => {
        table.bigIncrements("id").primary();
        table.date("tariff_date").notNullable().comment("Day for which this tariff row applies");
        table.string("geo_name").notNullable().comment("geoName from WB API");
        table.string("warehouse_name").notNullable().comment("warehouseName from WB API");
        table
            .jsonb("data")
            .notNullable()
            .comment("Single tariff row payload from WB API for this geo/warehouse/date");
        table
            .timestamp("created_at", { useTz: true })
            .notNullable()
            .defaultTo(knex.fn.now())
            .comment("Time when this tariff row was first saved");
        table
            .timestamp("updated_at", { useTz: true })
            .notNullable()
            .defaultTo(knex.fn.now())
            .comment("Time when this tariff row was last updated");

        table.unique(["tariff_date", "geo_name", "warehouse_name"], {
            indexName: "box_tariff_items_unique_per_day_geo_wh",
        });
    });
}

/**
 * @param {import("knex").Knex} knex
 * @returns {Promise<void>}
 */
export async function down(knex) {
    await knex.schema.dropTable("box_tariff_items");
}


/**
 * Add numeric coefficient fields and unique index for box_tariff_items.
 *
 * @param {import("knex").Knex} knex
 * @returns {Promise<void>}
 */
export async function up(knex) {
    await knex.schema.alterTable("box_tariff_items", (table) => {
        table.decimal("box_delivery_coef", null).nullable();
        table.decimal("box_storage_coef", null).nullable();
        table.decimal("box_delivery_marketplace_coef", null).nullable();
        table.decimal("box_delivery_liter", null).nullable();
    });

    // Backfill numeric fields from expressions / key-value table where possible
    const items = await knex("box_tariff_items").select(
        "id",
        "box_delivery_coef_expr",
        "box_storage_coef_expr",
        "box_delivery_marketplace_coef_expr"
    );

    for (const row of items) {
        /** @type {Record<string, unknown>} */
        const updates = {};

        /** @param {unknown} v */
        function num(v) {
            if (v === null || v === undefined) return null;
            const n = Number(v);
            return Number.isNaN(n) ? null : n;
        }

        const d = num(row.box_delivery_coef_expr);
        const s = num(row.box_storage_coef_expr);
        const m = num(row.box_delivery_marketplace_coef_expr);

        if (d !== null) updates.box_delivery_coef = d;
        if (s !== null) updates.box_storage_coef = s;
        if (m !== null) updates.box_delivery_marketplace_coef = m;

        // Try to pick up boxDeliveryLiter from key/value if present
        const literRow = await knex("box_tariff_item_fields")
            .where({ box_tariff_item_id: row.id, field_key: "boxDeliveryLiter" })
            .first();
        if (literRow && literRow.value_num != null) {
            updates.box_delivery_liter = literRow.value_num;
        }

        if (Object.keys(updates).length > 0) {
            await knex("box_tariff_items").where({ id: row.id }).update(updates);
        }
    }

    // Optional basic CHECKs (non-negative where applicable)
    await knex.schema.raw(
        'ALTER TABLE box_tariff_items ' +
            'ADD CONSTRAINT box_tariff_items_box_delivery_liter_nonneg ' +
            'CHECK (box_delivery_liter IS NULL OR box_delivery_liter >= 0)'
    );

    // Before adding unique constraint, remove duplicates by keeping the newest row
    // per (tariff_date, warehouse_name) based on updated_at/id.
    await knex.raw(`
        WITH ranked AS (
            SELECT
                id,
                row_number() OVER (
                    PARTITION BY tariff_date, warehouse_name
                    ORDER BY updated_at DESC, id DESC
                ) AS rn
            FROM box_tariff_items
        )
        DELETE FROM box_tariff_items
        WHERE id IN (SELECT id FROM ranked WHERE rn > 1);
    `);

    // Unique constraint to support ON CONFLICT upserts
    await knex.schema.alterTable("box_tariff_items", (table) => {
        table.unique(
            ["tariff_date", "warehouse_name"],
            "box_tariff_items_unique_per_day_wh"
        );
    });
}

/**
 * @param {import("knex").Knex} knex
 * @returns {Promise<void>}
 */
export async function down(knex) {
    await knex.schema.alterTable("box_tariff_items", (table) => {
        table.dropUnique(
            ["tariff_date", "warehouse_name"],
            "box_tariff_items_unique_per_day_wh"
        );
        table.dropColumn("box_delivery_coef");
        table.dropColumn("box_storage_coef");
        table.dropColumn("box_delivery_marketplace_coef");
        table.dropColumn("box_delivery_liter");
    });

    await knex.schema.raw(
        "ALTER TABLE box_tariff_items " +
            "DROP CONSTRAINT IF EXISTS box_tariff_items_box_delivery_liter_nonneg"
    );
}


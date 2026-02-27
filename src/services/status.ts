import knex from "#postgres/knex.js";

export interface ServiceStatus {
    db: {
        ok: boolean;
        error?: string;
    };
    tariffs: {
        latestDate: string | null;
        totalCount: number;
    };
}

/**
 * Returns a lightweight status snapshot of the service:
 * - DB connectivity
 * - Latest tariff_date and total count in box_tariff_items
 */
export async function getStatus(): Promise<ServiceStatus> {
    const db = { ok: false, error: undefined as string | undefined };
    let latestDate: string | null = null;
    let totalCount = 0;

    try {
        await knex.raw("select 1");
        db.ok = true;
    } catch (error) {
        db.ok = false;
        db.error = error instanceof Error ? error.message : String(error);
        return {
            db,
            tariffs: { latestDate, totalCount },
        };
    }

    const latest = await knex("box_tariff_items")
        .max("tariff_date as max_date")
        .first();
    const latestRaw = latest?.max_date as string | Date | null | undefined;
    latestDate =
        latestRaw instanceof Date
            ? latestRaw.toISOString().slice(0, 10)
            : latestRaw ?? null;

    const countResult = await knex("box_tariff_items")
        .count<{ count: string }>("* as count")
        .first();
    const count = countResult?.count ?? "0";
    totalCount = Number(count);

    return {
        db,
        tariffs: {
            latestDate,
            totalCount,
        },
    };
}


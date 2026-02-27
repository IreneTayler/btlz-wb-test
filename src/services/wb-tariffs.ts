import env from "#config/env/env.js";
import type { WbBoxTariffsResponse } from "#types/wb-tariffs.js";
import { upsertForDate } from "#repositories/box-tariff-items.js";
import { withRetry } from "#utils/retry.js";
import { z } from "zod";

const WB_BOX_TARIFFS_URL = "https://common-api.wildberries.ru/api/v1/tariffs/box";

const wbBoxTariffRowSchema = z
    .object({
        geoName: z.string(),
        warehouseName: z.string(),
        boxDeliveryCoefExpr: z.union([z.string(), z.number()]).nullable().optional(),
        boxStorageCoefExpr: z.union([z.string(), z.number()]).nullable().optional(),
        boxDeliveryMarketplaceCoefExpr: z
            .union([z.string(), z.number()])
            .nullable()
            .optional(),
    })
    .catchall(z.union([z.string(), z.number(), z.boolean(), z.null()]));

const wbBoxTariffsResponseSchema = z.array(wbBoxTariffRowSchema);

/**
 * Fetches box tariffs from WB API.
 * WB requires a `date` query parameter (YYYY-MM-DD).
 */
export async function fetchBoxTariffs(forDate: Date): Promise<WbBoxTariffsResponse> {
    if (!env.WB_API_TOKEN) {
        throw new Error("WB_API_TOKEN is not configured");
    }

    const dateStr = forDate.toISOString().slice(0, 10);
    const url = new URL(WB_BOX_TARIFFS_URL);
    url.searchParams.set("date", dateStr);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    let res: Response;
    try {
        res = await fetch(url.toString(), {
            method: "GET",
            headers: {
                Authorization: env.WB_API_TOKEN,
                "Content-Type": "application/json",
            },
            signal: controller.signal,
        });
    } catch (error) {
        clearTimeout(timeout);
        throw error;
    }
    clearTimeout(timeout);

    if (!res.ok) {
        const text = await res.text();
        throw new Error(`WB API error ${res.status}: ${text}`);
    }
    const data: unknown = await res.json();

    // Prefer top-level array; fall back to searching nested arrays for robustness
    let candidate: unknown = Array.isArray(data) ? data : undefined;
    if (!candidate) {
        const arrays: unknown[] = [];
        function collectArrays(value: unknown, depth: number) {
            if (depth > 6) return;
            if (Array.isArray(value)) {
                if (value.length === 0 || typeof value[0] === "object") {
                    arrays.push(value);
                }
                for (const item of value) collectArrays(item, depth + 1);
                return;
            }
            if (value && typeof value === "object") {
                for (const v of Object.values(value as Record<string, unknown>)) {
                    collectArrays(v, depth + 1);
                }
            }
        }
        collectArrays(data, 0);
        if (arrays.length > 0) {
            candidate = arrays[0];
        }
    }

    if (!candidate) {
        console.warn(
            "WB API box tariffs: could not find an array of tariffs in response; storing empty list."
        );
        return [];
    }

    const parsed = wbBoxTariffsResponseSchema.safeParse(candidate);
    if (!parsed.success) {
        console.error("WB API box tariffs: validation failed", parsed.error);
        return [];
    }

    return parsed.data as WbBoxTariffsResponse;
}

/**
 * Saves or updates box tariffs for the given date via repository.
 */
export async function saveBoxTariffsForDate(
    tariffDate: Date,
    data: WbBoxTariffsResponse
): Promise<void> {
    if (!Array.isArray(data) || data.length === 0) return;
    await upsertForDate(tariffDate, data);
}

/**
 * Fetches from WB (with retry) and saves via repository.
 */
export async function fetchAndSaveBoxTariffs(): Promise<void> {
    const now = new Date();
    const data = await withRetry(() => fetchBoxTariffs(now), {
        maxAttempts: 3,
        delayMs: 2000,
        backoff: 2,
    });
    await withRetry(() => saveBoxTariffsForDate(now, data), {
        maxAttempts: 2,
        delayMs: 500,
    });
}

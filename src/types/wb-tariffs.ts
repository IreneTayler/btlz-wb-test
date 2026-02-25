/**
 * WB Box Tariffs API types.
 * Endpoint: GET https://common-api.wildberries.ru/api/v1/tariffs/box
 */

/** Single box tariff row from WB API (flexible for unknown fields). */
export interface WbBoxTariffRow {
    [key: string]: string | number | boolean | null | undefined;
}

/** API response: array of tariff rows. */
export type WbBoxTariffsResponse = WbBoxTariffRow[];

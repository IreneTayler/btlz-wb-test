import dotenv from "dotenv";
import { z } from "zod";

const NODE_ENV = process.env.NODE_ENV ?? "development";

// Load environment-specific file first (if present), then fall back to .env
dotenv.config({
    path:
        NODE_ENV === "production"
            ? ".env.production"
            : ".env.development",
});
dotenv.config();

const envSchema = z.object({
    NODE_ENV: z.union([z.undefined(), z.enum(["development", "production"])]),
    POSTGRES_HOST: z.union([z.undefined(), z.string()]),
    POSTGRES_PORT: z
        .string()
        .regex(/^[0-9]+$/)
        .transform((value) => parseInt(value)),
    POSTGRES_DB: z.string(),
    POSTGRES_USER: z.string(),
    POSTGRES_PASSWORD: z.string(),
    APP_PORT: z.union([
        z.undefined(),
        z
            .string()
            .regex(/^[0-9]+$/)
            .transform((value) => parseInt(value)),
    ]),
    WB_API_TOKEN: z.string().min(1),
    GOOGLE_APPLICATION_CREDENTIALS: z.union([z.undefined(), z.string()]),
    SPREADSHEET_IDS: z.union([z.undefined(), z.string()]),
});

const rawEnv = {
    POSTGRES_HOST: process.env.POSTGRES_HOST,
    POSTGRES_PORT: process.env.POSTGRES_PORT,
    POSTGRES_DB: process.env.POSTGRES_DB,
    POSTGRES_USER: process.env.POSTGRES_USER,
    POSTGRES_PASSWORD: process.env.POSTGRES_PASSWORD,
    NODE_ENV: process.env.NODE_ENV,
    APP_PORT: process.env.APP_PORT,
    WB_API_TOKEN: process.env.WB_API_TOKEN,
    GOOGLE_APPLICATION_CREDENTIALS: process.env.GOOGLE_APPLICATION_CREDENTIALS,
    SPREADSHEET_IDS: process.env.SPREADSHEET_IDS,
};

const env = envSchema.parse(rawEnv);

export default env;

import { config } from "dotenv";
import { z } from "zod";
import { DEMO_ADMIN_PASSWORD } from "./constants";

config({ quiet: true });

const flag01 = z.enum(["0", "1"]);

const adminTokenSchema = z.preprocess(
  (v) => {
    if (v === undefined || v === null) return DEMO_ADMIN_PASSWORD;
    const s = String(v).trim();
    return s === "" ? DEMO_ADMIN_PASSWORD : s;
  },
  z.string().min(8, "ADMIN_TOKEN must be at least 8 characters"),
);

const EnvSchema = z.object({
  PORT: z.string().min(1, "PORT is required"),
  DATABASE_URL: z
    .string()
    .min(1)
    .describe("PostgreSQL connection URI, e.g. postgresql://user:pass@host:5432/db"),
  PUBLIC_BASE_URL: z
    .string()
    .url()
    .describe("Public origin used to build short URLs (no trailing slash)"),
  ADMIN_TOKEN: adminTokenSchema,
  TRUST_PROXY: flag01.transform((v) => v === "1"),
  BLOCK_INTERNAL_URLS: flag01.transform((v) => v === "1"),
});

export type AppEnv = z.infer<typeof EnvSchema>;

let cached: AppEnv | null = null;

export function getEnv(): AppEnv {
  if (cached) return cached;
  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => i.message).join("; ");
    throw new Error(`Invalid environment: ${msg}`);
  }
  cached = parsed.data;
  return parsed.data;
}

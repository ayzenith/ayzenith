import { z } from "zod";

/**
 * Contact / partnership inquiry schema — the single source of truth validated
 * on BOTH the client (instant feedback) and the server (never trust the
 * client). Enum values mirror the option keys in messages/<locale>.json.
 */

export const REGION_VALUES = [
  "europe",
  "turkiye",
  "mena",
  "asia",
  "americas",
  "other",
] as const;

export const INTEREST_VALUES = [
  "sourcing",
  "distribution",
  "privateLabel",
  "partnership",
  "other",
] as const;

export const contactSchema = z.object({
  name: z.string().trim().min(1).max(120),
  company: z.string().trim().min(1).max(160),
  email: z.string().trim().email().max(200),
  region: z.enum(REGION_VALUES),
  interest: z.enum(INTEREST_VALUES),
  message: z.string().trim().min(1).max(2000),
});

export type ContactInput = z.infer<typeof contactSchema>;

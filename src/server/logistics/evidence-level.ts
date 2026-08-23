/** Shared type — split into its own file so pure modules (estimateability.ts)
 *  don't need to import anything DB-touching (evidence.ts) just for the type. */
export type EvidenceLevel = "DIRECT_LANE" | "NEARBY_LANE" | "COUNTRY_CORRIDOR" | "REGIONAL_INDEX_ONLY" | "NONE";

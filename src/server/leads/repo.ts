import "server-only";

import { db } from "@/lib/db";
import {
  saveDiscoveryWith,
  type CompanyDraft,
  type SaveDiscoveryResult,
  type SearchDraft,
} from "./discovery-save";

export type { CompanyDraft, SaveDiscoveryResult, SearchDraft, SourceDraft } from "./discovery-save";

/**
 * AYZENITH LEAD FINDER — write repository.
 *
 * The only place discovery+verification results are persisted. It writes the
 * search context once and each company with its provenance, contacts and
 * verification rows (§10/§11/§19) in a single flow. Nothing here interprets data —
 * it stores exactly what the pipeline produced, so the "no fabricated field"
 * guarantee is preserved right down to the database.
 */

/**
 * Persist a discovery run. Idempotent for a repeated search context — see
 * `discovery-save.ts`, which holds the implementation so it can be tested.
 */
export function saveDiscovery(search: SearchDraft, companies: CompanyDraft[]): Promise<SaveDiscoveryResult> {
  return saveDiscoveryWith(db, search, companies);
}

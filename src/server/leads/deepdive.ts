import "server-only";

import { db } from "@/lib/db";
import { resolveProductProfile } from "@/config/leads";
import { fetchSiteIntel } from "./providers/website";
import { resolveBrandFacts, findBrandQidByName } from "./providers/wikidata";
import { checkVatId } from "./providers/vies";
import { pickDeepDiveTargets } from "./filter";
import { listCompaniesForSearch } from "./leads";

/**
 * AYZENITH LEAD FINDER — deep dive on the few leads worth a phone call (§V3.12).
 *
 * WHY THIS IS SEPARATE FROM THE SEARCH. A search has to stay under a minute, so
 * it reads a homepage and moves on. But once the list exists, the owner does not
 * need 133 firms — they need to walk into a meeting knowing who to ask for at
 * three of them. That is a different amount of work per firm, and it is only
 * worth paying for a handful, so it is a button rather than part of every run.
 *
 * THE PROBLEM THIS HAD TO SOLVE FIRST. The best leads are frequently the ones we
 * know least about: in the live Milano search, Calzedonia, Intimissimi and
 * Yamamay all came top and all had NO website in OpenStreetMap, so a deep dive
 * would have reported "nothing found" for exactly the three firms that mattered.
 * Wikidata carries the official address for every one of them (P856), and the
 * search already records the brand's Wikidata page as a source — so the trail
 * back to a readable website exists without storing anything new.
 *
 * WHAT IT WILL NOT DO. It does not invent an executive's email, guess
 * firstname.lastname@, or read anyone's LinkedIn profile. If a firm publishes no
 * name, the report says so. For large chains that is the normal outcome and it
 * is not a failure — the legal entity, the VAT number and the corporate channels
 * are still worth having, and the honest gap is worth more than a fabricated
 * contact.
 */

export type DeepDiveResult = {
  attempted: number;
  /** Firms where the deep read reached a live site. */
  read: number;
  /** Firms where at least one NAMED person was found. */
  named: number;
  /** Firms we could not open at all (no website anywhere, or it did not answer). */
  unreachable: number;
};

/** The check row that marks a company as deep-dived, so the screen can tell the
 *  difference between "not analysed yet" and "analysed, and this is all there is". */
export const DEEP_DIVE_CHECK = "deep-dive";

/** Recover a brand's Wikidata id from the source row the search wrote (§V3.11). */
function qidFromSources(urls: string[]): string | undefined {
  for (const u of urls) {
    const m = /wikidata\.org\/wiki\/(Q\d+)/.exec(u);
    if (m) return m[1];
  }
  return undefined;
}

/**
 * Run the deep read for a search's top targets.
 *
 * Sequential on purpose: three firms, each hitting one host repeatedly. Widening
 * this would save a few seconds and make us an impolite crawler on somebody
 * else's server.
 */
export async function runDeepDive(searchId: string, limit = 3): Promise<DeepDiveResult> {
  const search = await db.leadSearch.findUnique({
    where: { id: searchId },
    select: { id: true, productQuery: true, searchTerms: true },
  });
  if (!search) return { attempted: 0, read: 0, named: 0, unreachable: 0 };

  const view = await listCompaniesForSearch(searchId);
  const targets = pickDeepDiveTargets(view, limit);
  if (targets.length === 0) return { attempted: 0, read: 0, named: 0, unreachable: 0 };

  const { profile } = resolveProductProfile(search.productQuery);
  const productTerms =
    Array.isArray(search.searchTerms) && search.searchTerms.length > 0
      ? (search.searchTerms as string[])
      : Array.from(new Set([...profile.terms.de, ...profile.terms.en, ...profile.terms.tr]));

  const result: DeepDiveResult = { attempted: 0, read: 0, named: 0, unreachable: 0 };

  for (const t of targets) {
    result.attempted++;

    const row = await db.leadCompany.findUnique({
      where: { id: t.id },
      select: {
        id: true, name: true, country: true, website: true, email: true, phone: true,
        legalName: true, sources: { select: { sourceUrl: true } },
      },
    });
    if (!row) continue;

    // Where to read. The firm's own website when OSM had one; otherwise the
    // official site from its Wikidata brand record — which is the only reason a
    // chain like Intimissimi can be analysed at all.
    let website = row.website ?? null;
    let websiteFrom: "OSM" | "WIKIDATA" | null = website ? "OSM" : null;
    if (!website) {
      // The brand id comes from the source row the search wrote; failing that,
      // from a strict name lookup — which is what lets a chain OSM never tagged
      // (and every lead found before that source row existed) still be opened.
      const qid =
        qidFromSources(row.sources.map((s) => s.sourceUrl ?? "").filter(Boolean)) ??
        (await findBrandQidByName(row.name));
      if (qid) {
        const facts = await resolveBrandFacts([qid]);
        const site = facts.get(qid)?.officialWebsite;
        if (site) {
          website = site;
          websiteFrom = "WIKIDATA";
        }
      }
    }

    if (!website) {
      result.unreachable++;
      await writeCheck(row.id, false, "Bu firma için okunabilecek bir website bulunamadı — ne OSM kaydında ne de Wikidata marka kaydında adres var.");
      continue;
    }

    let intel;
    try {
      intel = await fetchSiteIntel(website, productTerms, profile.signals, "full", row.country);
    } catch {
      intel = null;
    }

    if (!intel || intel.status === "UNREACHABLE") {
      result.unreachable++;
      await writeCheck(row.id, null, `Website bulundu (${website}) ama bu denemede yanıt vermedi — site kapalı anlamına gelmez.`, website);
      continue;
    }
    result.read++;

    // VAT, validated at the source rather than trusted as printed (§V3.7).
    let vatNote = "";
    if (intel.vatId) {
      try {
        const vies = await checkVatId(intel.vatId);
        if (vies?.valid) {
          vatNote = ` · VKN ${intel.vatId} VIES'te geçerli${vies.name ? ` (${vies.name})` : ""}`;
        }
      } catch {
        /* VIES being down must not lose the rest of the read. */
      }
    }

    // Persist only what the site actually published.
    const named = intel.decisionMakers.filter((d) => d.firstName && d.lastName);
    if (named.length > 0) result.named++;

    await db.$transaction([
      db.leadCompany.update({
        where: { id: row.id },
        data: {
          website,
          websiteStatus: "ACTIVE",
          legalName: intel.legalName ?? row.legalName ?? null,
          email: row.email ?? intel.emails[0] ?? null,
          phone: row.phone ?? intel.phones[0] ?? null,
          lastCheckedAt: new Date(),
        },
      }),
      // Replace this firm's contacts with what the deep read found, so a re-run
      // never accumulates duplicates of the same person.
      db.leadContact.deleteMany({ where: { companyId: row.id } }),
      ...named.slice(0, 8).map((d) =>
        db.leadContact.create({
          data: {
            companyId: row.id,
            firstName: d.firstName ?? null,
            lastName: d.lastName ?? null,
            role: d.role,
            // Only ever an address that appeared verbatim on the page (§6).
            corporateEmail: d.email ?? null,
            source: "OFFICIAL_WEBSITE",
            sourceUrl: d.sourceUrl,
            confidence: d.confidence,
          },
        }),
      ),
      db.leadSource.create({
        data: {
          companyId: row.id,
          dataField: "deep-dive",
          sourceType: websiteFrom === "WIKIDATA" ? "OTHER_FREE_SOURCE" : "OFFICIAL_WEBSITE",
          label:
            websiteFrom === "WIKIDATA"
              ? "Derin analiz — resmi site Wikidata kaydından bulundu"
              : "Derin analiz — resmi website",
          sourceUrl: intel.finalUrl,
        },
      }),
    ]);

    await writeCheck(
      row.id,
      named.length > 0 ? true : null,
      named.length > 0
        ? `${named.length} isimli muhatap bulundu: ${named.map((d) => `${d.firstName} ${d.lastName} (${d.role})`).join(", ")}${vatNote}`
        : `Site okundu (${intel.pagesFetched.length} sayfa) ama isimli muhatap yayınlanmamış — büyük zincirlerde olağandır${vatNote}`,
      intel.finalUrl,
    );
  }

  return result;
}

/** One verification row per firm, replacing any earlier deep-dive verdict. */
async function writeCheck(companyId: string, passed: boolean | null, evidence: string, sourceUrl?: string) {
  await db.$transaction([
    db.leadVerification.deleteMany({ where: { companyId, check: DEEP_DIVE_CHECK } }),
    db.leadVerification.create({
      data: { companyId, check: DEEP_DIVE_CHECK, passed, evidence, sourceUrl: sourceUrl ?? null },
    }),
  ]);
}

export type DeepDiveReport = {
  companyId: string;
  /** The deep-dive verdict sentence, exactly as it was written at check time. */
  verdict: string | null;
  contacts: Array<{
    id: string;
    firstName: string | null;
    lastName: string | null;
    role: string | null;
    corporateEmail: string | null;
  }>;
};

/**
 * What a previous deep dive found, for the firms it was run on.
 *
 * Returns rows ONLY for companies that actually carry a deep-dive verdict, so
 * the screen can distinguish "not analysed yet" from "analysed, and this is all
 * there is" — a distinction the whole honesty doctrine rests on.
 */
export async function getDeepDiveReports(companyIds: string[]): Promise<Map<string, DeepDiveReport>> {
  const out = new Map<string, DeepDiveReport>();
  if (companyIds.length === 0) return out;

  const checks = await db.leadVerification.findMany({
    where: { companyId: { in: companyIds }, check: DEEP_DIVE_CHECK },
    select: { companyId: true, evidence: true },
  });
  if (checks.length === 0) return out;

  const done = checks.map((c) => c.companyId);
  const contacts = await db.leadContact.findMany({
    where: { companyId: { in: done } },
    select: { id: true, companyId: true, firstName: true, lastName: true, role: true, corporateEmail: true },
    orderBy: { confidence: "desc" },
  });

  for (const c of checks) {
    out.set(c.companyId, {
      companyId: c.companyId,
      verdict: c.evidence,
      contacts: contacts
        .filter((k) => k.companyId === c.companyId)
        .map(({ id, firstName, lastName, role, corporateEmail }) => ({
          id, firstName, lastName, role, corporateEmail,
        })),
    });
  }
  return out;
}

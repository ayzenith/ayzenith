"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireUser } from "@/server/auth";
import { extractAttributes } from "@/server/import/attributes";
import { runProductAnalysis, type ProductAnalysisInput } from "@/server/product-intel/analyze";
import { ourFacets } from "@/server/product-intel/facets";
import { deleteAnalysis } from "@/server/product-intel/repo";
import { sheetToDelimitedText } from "@/server/product-intel/xlsx";

function s(fd: FormData, key: string): string | null {
  const v = fd.get(key);
  return typeof v === "string" && v.trim() !== "" ? v.trim() : null;
}

/** Turkish or English decimal input from a form field. */
function n(fd: FormData, key: string): number | null {
  const raw = s(fd, key);
  if (!raw) return null;
  const cleaned = raw.replace(/\s/g, "");
  const hasComma = cleaned.includes(",");
  const hasDot = cleaned.includes(".");
  const normalized =
    hasComma && hasDot
      ? cleaned.replace(/\./g, "").replace(",", ".")
      : hasComma
        ? cleaned.replace(",", ".")
        : cleaned;
  const v = Number(normalized.replace(/[^\d.-]/g, ""));
  return Number.isFinite(v) ? v : null;
}

export async function analyzeProductAction(fd: FormData): Promise<void> {
  const user = await requireUser();

  const productName = s(fd, "productName");
  if (!productName) throw new Error("Ürün adı zorunludur.");

  // An uploaded sheet and a pasted block are the same thing by the time they
  // reach the parser — both end up as delimited text.
  let competitorBlock = s(fd, "competitorBlock");
  const file = fd.get("competitorFile");
  if (file instanceof File && file.size > 0) {
    const buffer = Buffer.from(await file.arrayBuffer());
    const isXlsx = /\.xlsx$/i.test(file.name) || file.type.includes("spreadsheetml");
    const fromFile = isXlsx ? (await sheetToDelimitedText(buffer)).text : buffer.toString("utf8");
    competitorBlock = [competitorBlock, fromFile].filter(Boolean).join("\n");
  }

  const input: ProductAnalysisInput = {
    productName,
    description: s(fd, "description"),
    specText: s(fd, "specText"),
    brand: s(fd, "brand"),
    model: s(fd, "model"),
    mpn: s(fd, "mpn"),
    ean: s(fd, "ean"),

    marketplace: s(fd, "marketplace") ?? "TRENDYOL",
    marketCountry: s(fd, "marketCountry") ?? "TR",
    channelId: s(fd, "channelId"),
    itemId: s(fd, "itemId"),
    importCaseId: s(fd, "importCaseId"),

    productUrl: s(fd, "productUrl"),
    competitorBlock,
    competitorUrls: [s(fd, "competitorUrl1"), s(fd, "competitorUrl2"), s(fd, "competitorUrl3")].filter((u): u is string => !!u),

    userUnitCost: n(fd, "userUnitCost"),
    shipping: n(fd, "shipping") ?? 0,
    packaging: n(fd, "packaging") ?? 0,
    returnRatePct: n(fd, "returnRatePct"),
    vatRatePct: n(fd, "vatRatePct"),
    commissionPct: n(fd, "commissionPct"),
    targetMarginPct: n(fd, "targetMarginPct"),
  };

  const { analysisId } = await runProductAnalysis(input, { persist: true, userId: user.id });
  revalidatePath("/os/product-intel");
  redirect(`/os/product-intel/${analysisId}`);
}

/**
 * Live attribute preview for the form.
 *
 * Runs the REAL extractor rather than a client-side approximation, so what the
 * operator sees while typing is exactly what the analysis will use. It has to
 * be a server action because the extractor's text primitives reach for
 * `node:crypto` and cannot be bundled for a browser.
 */
export async function previewAttributesAction(
  raw: { productName: string; description: string; specText: string; brand: string },
): Promise<Array<{ key: string; label: string; value: string; from: string }>> {
  await requireUser();
  if (!raw.productName.trim() && !raw.specText.trim() && !raw.description.trim()) return [];

  const attributes = extractAttributes(
    { name: raw.productName || "-", brand: raw.brand || null },
    [
      ...(raw.description.trim() ? [{ text: raw.description, provenance: "USER_ENTERED" as const, from: "Açıklama" }] : []),
      ...(raw.specText.trim() ? [{ text: raw.specText, provenance: "USER_ENTERED" as const, from: "Teknik özellikler" }] : []),
    ],
  );
  return ourFacets(attributes).map((f) => ({ key: f.key, label: f.label, value: f.value, from: f.from }));
}

export async function deleteAnalysisAction(fd: FormData): Promise<void> {
  await requireUser();
  const id = String(fd.get("id") ?? "");
  if (id) await deleteAnalysis(id);
  revalidatePath("/os/product-intel");
  redirect("/os/product-intel");
}

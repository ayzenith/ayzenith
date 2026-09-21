import "server-only";

import { db } from "@/lib/db";
import type { PurchaseFormInitial } from "@/components/os/purchase-form";
import type { ImportAnalysisInput } from "./analyze";
import type { TaxResult } from "./tax";
import { formatGtip } from "./text";

/**
 * IMPORT INTELLIGENCE → Business OS purchase.
 *
 * A case becomes an ordinary purchase: the goods line, and the costs as normal
 * CostLines (freight, insurance, customs = the duties the case COMPUTED,
 * broker/handling as OTHER). Confirming that purchase is what writes the
 * landed unit cost onto the item — through the existing costing engine, which
 * this module never touches. Only costs with a real amount are carried over;
 * an unknown one stays out and is named in the note.
 */
export async function purchasePrefillFromCase(caseId: string): Promise<{ initial: PurchaseFormInitial; notes: string[]; code: string } | null> {
  const c = await db.importCase.findUnique({ where: { id: caseId } });
  if (!c) return null;
  const input = c.input as unknown as ImportAnalysisInput;
  const tax = c.tax as unknown as TaxResult;
  const notes: string[] = [];
  const costs: NonNullable<PurchaseFormInitial["costs"]> = [];

  const addCost = (kind: string, label: string, amount: number | null, currency: string) => {
    if (amount != null && amount > 0) costs.push({ kind, label, amount: String(Math.round(amount * 100) / 100), currency });
  };
  addCost("FREIGHT", "Navlun (ithalat analizi)", input.freight.amount, input.freight.currency);
  if (input.freight.amount == null) notes.push("Navlun bilinmediği için eklenmedi.");
  addCost("INSURANCE", "Sigorta (ithalat analizi)", input.insurance.amount, input.insurance.currency);

  const dutyLines = tax.lines.filter((l) => l.inLandedCost && l.amount != null && l.amount > 0);
  const duties = dutyLines.reduce((s, l) => s + (l.amount ?? 0), 0);
  addCost("CUSTOMS", `Gümrük vergileri — ${dutyLines.map((l) => l.label).join(", ")}`, duties, "TRY");
  const unresolved = tax.lines.filter((l) => l.inLandedCost && l.amount == null && l.status !== "NOT_CHECKED");
  if (unresolved.length) notes.push(`Hesaplanamayan vergi kalemleri eklenmedi: ${unresolved.map((l) => l.label).join(", ")}.`);
  addCost("OTHER", "Gümrük müşaviri", input.broker.amount, input.broker.currency);
  addCost("OTHER", "Liman / ardiye / elleçleme", input.handling.amount, input.handling.currency);
  addCost("OTHER", "Diğer masraflar", input.other.amount, input.other.currency);
  notes.push("İthalat KDV'si indirilebilir olduğundan maliyet satırı yapılmadı.");
  if (!c.itemId) notes.push("Ürün satırında Business OS ürününü seçin.");

  const gtip = c.userGtip ?? c.predictedGtip;
  return {
    code: c.code,
    notes,
    initial: {
      supplierId: c.supplierId,
      currency: input.currency,
      note: `${c.code} ithalat analizinden. GTİP ${gtip ? formatGtip(gtip) : "—"} (${c.classificationStatus === "AI_PREDICTED" ? "AI tahmini" : "kullanıcı girdisi"}).`,
      lines: [{ itemId: c.itemId ?? "", quantity: input.quantity != null ? String(input.quantity) : "1", unitPrice: input.unitPrice != null ? String(input.unitPrice) : "" }],
      costs,
      hidden: { importCaseId: c.id },
    },
  };
}

export async function linkImportCaseToPurchase(caseId: string, purchaseId: string): Promise<void> {
  await db.importCase.updateMany({ where: { id: caseId, purchaseId: null }, data: { purchaseId } });
}

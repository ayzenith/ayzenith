"use client";

import { useState } from "react";
import { COST_ALLOCATION_LABELS, COST_KIND_LABELS, CURRENCIES } from "@/config/os";
import { Card, Field, btn, input } from "./ui";

/**
 * The new-purchase form.
 *
 * Cost lines are the reason this is a client component rather than the plain
 * server form it used to be. Freight, customs, packaging — each can carry its
 * own currency and exchange rate and gets spread over the goods by
 * `allocateCosts()` on confirm. A form that could only take ONE product and NO
 * cost line could never produce the "gerçek maliyet" this module exists for.
 */

export type PurchaseFormItem = { id: string; sku: string; name: string; unit: string; purchasePrice: number | null; purchaseCurrency: string };
export type PurchaseFormParty = { id: string; name: string };
export type PurchaseFormLocation = { id: string; name: string };

type Line = { key: string; itemId: string; quantity: string; unitPrice: string; discountRate: string; vatRate: string };
type Cost = { key: string; kind: string; label: string; amount: string; currency: string; fxRate: string; allocation: string };

let lineSeq = 0;
function newLine(): Line {
  lineSeq += 1;
  return { key: `l${lineSeq}`, itemId: "", quantity: "1", unitPrice: "", discountRate: "", vatRate: "" };
}

let costSeq = 0;
function newCost(defaultCurrency: string, defaultFxRate: string): Cost {
  costSeq += 1;
  return { key: `c${costSeq}`, kind: "FREIGHT", label: "", amount: "", currency: defaultCurrency, fxRate: defaultFxRate, allocation: "BY_VALUE" };
}

export function PurchaseForm({
  action,
  items,
  suppliers,
  locations,
  baseCurrency,
  fxRates,
}: {
  action: (fd: FormData) => Promise<void>;
  items: PurchaseFormItem[];
  suppliers: PurchaseFormParty[];
  locations: PurchaseFormLocation[];
  baseCurrency: string;
  fxRates: Record<string, number>;
}) {
  const [lines, setLines] = useState<Line[]>([newLine()]);
  const [costs, setCosts] = useState<Cost[]>([]);
  const [currency, setCurrency] = useState(baseCurrency);
  const [fxRate, setFxRate] = useState("1");

  function updateLine(key: string, patch: Partial<Line>) {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }

  function onItemChange(key: string, itemId: string) {
    const item = items.find((i) => i.id === itemId);
    updateLine(key, { itemId, unitPrice: item?.purchasePrice != null ? String(item.purchasePrice) : "" });
  }

  function updateCost(key: string, patch: Partial<Cost>) {
    setCosts((prev) => prev.map((c) => (c.key === key ? { ...c, ...patch } : c)));
  }

  function suggestedRate(cur: string): string {
    if (cur === baseCurrency) return "1";
    const r = fxRates[cur];
    return r && Number.isFinite(r) && r > 0 ? String(r) : "1";
  }

  function onCurrencyChange(next: string) {
    setCurrency(next);
    setFxRate(suggestedRate(next));
  }

  return (
    <form action={action} className="flex flex-col gap-4">
      <Card>
        <div className="grid gap-4 md:grid-cols-3">
          <Field label="Tedarikçi" required>
            <select name="supplierId" required className={input}>
              <option value="">Seç</option>
              {suppliers.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </Field>
          <Field label="Konum" hint="Malların gireceği yer">
            <select name="locationId" className={input}>
              <option value="">Varsayılan konum</option>
              {locations.map((l) => (
                <option key={l.id} value={l.id}>{l.name}</option>
              ))}
            </select>
          </Field>
          <Field label="Tarih">
            <input name="issuedAt" type="date" defaultValue={new Date().toISOString().slice(0, 10)} className={input} />
          </Field>
          <Field label="Para birimi">
            <select name="currency" className={input} value={currency} onChange={(e) => onCurrencyChange(e.target.value)}>
              {CURRENCIES.map((c) => (
                <option key={c.code} value={c.code}>{c.code}</option>
              ))}
            </select>
          </Field>
          <Field label="Kur" hint={`1 ${currency} = ? ${baseCurrency}`}>
            <input name="fxRate" value={fxRate} onChange={(e) => setFxRate(e.target.value)} inputMode="decimal" className={input} />
          </Field>
          <Field label="Durum">
            <select name="status" className={input} defaultValue="CONFIRMED">
              <option value="CONFIRMED">Onaylı</option>
              <option value="DRAFT">Taslak</option>
            </select>
          </Field>
        </div>
      </Card>

      <Card title="Satır ürünleri">
        <div className="flex flex-col gap-3">
          {lines.map((line, i) => (
            <div key={line.key} className="grid gap-2 rounded-lg border border-border p-3 md:grid-cols-[2fr_1fr_1fr_1fr_1fr_auto] md:items-end">
              <Field label={`Ürün ${i + 1}`} required>
                <select
                  name="lineItemId"
                  required
                  className={input}
                  value={line.itemId}
                  onChange={(e) => onItemChange(line.key, e.target.value)}
                >
                  <option value="">Seç</option>
                  {items.map((it) => (
                    <option key={it.id} value={it.id}>{it.sku} — {it.name}</option>
                  ))}
                </select>
              </Field>
              <Field label="Miktar" required>
                <input
                  name="lineQuantity"
                  required
                  inputMode="decimal"
                  value={line.quantity}
                  onChange={(e) => updateLine(line.key, { quantity: e.target.value })}
                  className={input}
                />
              </Field>
              <Field label="Birim fiyat" required>
                <input
                  name="lineUnitPrice"
                  required
                  inputMode="decimal"
                  value={line.unitPrice}
                  onChange={(e) => updateLine(line.key, { unitPrice: e.target.value })}
                  className={input}
                />
              </Field>
              <Field label="İskonto %">
                <input
                  name="lineDiscountRate"
                  inputMode="decimal"
                  value={line.discountRate}
                  onChange={(e) => updateLine(line.key, { discountRate: e.target.value })}
                  className={input}
                />
              </Field>
              <Field label="KDV %">
                <input
                  name="lineVatRate"
                  inputMode="decimal"
                  value={line.vatRate}
                  onChange={(e) => updateLine(line.key, { vatRate: e.target.value })}
                  className={input}
                />
              </Field>
              <button
                type="button"
                onClick={() => setLines((prev) => (prev.length > 1 ? prev.filter((l) => l.key !== line.key) : prev))}
                disabled={lines.length === 1}
                className={btn.ghost}
              >
                Satırı sil
              </button>
            </div>
          ))}
          <button type="button" onClick={() => setLines((prev) => [...prev, newLine()])} className={`${btn.secondary} self-start`}>
            + Satır ekle
          </button>
        </div>
      </Card>

      <Card
        title="Ek maliyetler"
        description="Nakliye, gümrük, ambalaj gibi doğrudan maliyetler; her biri satırlara dağıtılıp gerçek birim maliyeti oluşturur."
      >
        <div className="flex flex-col gap-3">
          {costs.map((cost) => (
            <div key={cost.key} className="grid gap-2 rounded-lg border border-border p-3 md:grid-cols-[1fr_1.4fr_1fr_0.8fr_0.8fr_1fr_auto] md:items-end">
              <Field label="Tür">
                <select name="costKind" className={input} value={cost.kind} onChange={(e) => updateCost(cost.key, { kind: e.target.value })}>
                  {Object.entries(COST_KIND_LABELS).map(([k, l]) => (
                    <option key={k} value={k}>{l}</option>
                  ))}
                </select>
              </Field>
              <Field label="Açıklama">
                <input name="costLabel" value={cost.label} onChange={(e) => updateCost(cost.key, { label: e.target.value })} className={input} placeholder="Örn. DHL kargo" />
              </Field>
              <Field label="Tutar" required>
                <input name="costAmount" required inputMode="decimal" value={cost.amount} onChange={(e) => updateCost(cost.key, { amount: e.target.value })} className={input} />
              </Field>
              <Field label="Para birimi">
                <select
                  name="costCurrency"
                  className={input}
                  value={cost.currency}
                  onChange={(e) => updateCost(cost.key, { currency: e.target.value, fxRate: suggestedRate(e.target.value) })}
                >
                  {CURRENCIES.map((c) => (
                    <option key={c.code} value={c.code}>{c.code}</option>
                  ))}
                </select>
              </Field>
              <Field label="Kur" hint={`1 ${cost.currency} = ? ${baseCurrency}`}>
                <input name="costFxRate" inputMode="decimal" value={cost.fxRate} onChange={(e) => updateCost(cost.key, { fxRate: e.target.value })} className={input} />
              </Field>
              <Field label="Dağıtım">
                <select name="costAllocation" className={input} value={cost.allocation} onChange={(e) => updateCost(cost.key, { allocation: e.target.value })}>
                  {Object.entries(COST_ALLOCATION_LABELS).map(([k, l]) => (
                    <option key={k} value={k}>{l}</option>
                  ))}
                </select>
              </Field>
              <button type="button" onClick={() => setCosts((prev) => prev.filter((c) => c.key !== cost.key))} className={btn.ghost}>
                Satırı sil
              </button>
            </div>
          ))}
          <button type="button" onClick={() => setCosts((prev) => [...prev, newCost(currency, suggestedRate(currency))])} className={`${btn.secondary} self-start`}>
            + Ek maliyet ekle
          </button>
        </div>
      </Card>

      <Card title="Not">
        <textarea name="note" rows={2} className={input} placeholder="Bu alışa dair not" />
      </Card>

      <div>
        <button type="submit" className={btn.primary}>Alışı kaydet</button>
      </div>
    </form>
  );
}

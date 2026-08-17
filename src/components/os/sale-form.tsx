"use client";

import { useId, useState } from "react";
import { CURRENCIES, TRADE_MODEL_LABELS } from "@/config/os";
import { Card, Field, Note, btn, input } from "./ui";

/**
 * The new-sale form.
 *
 * A sale is a client component because it is the one screen in Business OS
 * that needs interaction before it needs a database write: adding a second
 * product line, or switching to DROPSHIP and watching the location field
 * disappear (stoksuz satış never touches the ledger). Everything else in this
 * module stays a Server Component on purpose — this is the deliberate
 * exception.
 *
 * Line rows are uncontrolled inputs named identically across rows
 * (`lineItemId`, `lineQuantity`, …). The server action reads them back with
 * `formData.getAll(name)`, which preserves DOM order, so index i of every
 * array is the same row. No client-side validation duplicates the server's —
 * this form only has to get honest numbers to the action; `createSale`
 * decides what is acceptable.
 */

export type SaleFormItem = {
  id: string;
  sku: string;
  name: string;
  unit: string;
  salePrice: number | null;
  saleCurrency: string;
};

export type SaleFormParty = { id: string; name: string };
export type SaleFormChannel = { id: string; name: string; commissionRate: number | null };
export type SaleFormLocation = { id: string; name: string };

type Line = { key: string; itemId: string; quantity: string; unitPrice: string; discountRate: string; vatRate: string };

let rowSeq = 0;
function newLine(): Line {
  rowSeq += 1;
  return { key: `l${rowSeq}`, itemId: "", quantity: "1", unitPrice: "", discountRate: "", vatRate: "" };
}

export function SaleForm({
  action,
  getPrice,
  items,
  parties,
  channels,
  locations,
  baseCurrency,
  fxRates,
}: {
  action: (fd: FormData) => Promise<void>;
  /** Wraps the server's `priceFor(itemId, channelId)` — the channel override if
   *  one exists, otherwise the item's own sale price. */
  getPrice: (itemId: string, channelId: string) => Promise<{ price: number | null; currency: string }>;
  items: SaleFormItem[];
  parties: SaleFormParty[];
  channels: SaleFormChannel[];
  locations: SaleFormLocation[];
  baseCurrency: string;
  fxRates: Record<string, number>;
}) {
  const formId = useId();
  const [lines, setLines] = useState<Line[]>([newLine()]);
  const [tradeModel, setTradeModel] = useState("");
  const [channelId, setChannelId] = useState("");
  const [currency, setCurrency] = useState(baseCurrency);
  const [fxRate, setFxRate] = useState("1");

  const dropship = tradeModel === "DROPSHIP";

  function updateLine(key: string, patch: Partial<Line>) {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }

  async function onItemChange(key: string, itemId: string) {
    updateLine(key, { itemId });
    if (!itemId) return;
    const { price } = await getPrice(itemId, channelId);
    updateLine(key, { unitPrice: price != null ? String(price) : "" });
  }

  async function onChannelChange(next: string) {
    setChannelId(next);
    // Re-price lines that already have an item selected, so switching channel
    // reflects that channel's price without the owner re-picking every row.
    for (const line of lines) {
      if (!line.itemId) continue;
      const { price } = await getPrice(line.itemId, next);
      updateLine(line.key, { unitPrice: price != null ? String(price) : line.unitPrice });
    }
  }

  function onCurrencyChange(next: string) {
    setCurrency(next);
    if (next === baseCurrency) {
      setFxRate("1");
    } else {
      const suggested = fxRates[next];
      setFxRate(suggested && Number.isFinite(suggested) && suggested > 0 ? String(suggested) : "1");
    }
  }

  return (
    <form id={formId} action={action} className="flex flex-col gap-4">
      <Card>
        <div className="grid gap-4 md:grid-cols-3">
          <Field label="Müşteri">
            <select name="customerId" className={input}>
              <option value="">Seçmeden devam et</option>
              {parties.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </Field>
          <Field label="Kanal">
            <select name="channelId" className={input} value={channelId} onChange={(e) => onChannelChange(e.target.value)}>
              <option value="">Kanalsız</option>
              {channels.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </Field>
          <Field label="Ticari model">
            <select name="tradeModel" className={input} value={tradeModel} onChange={(e) => setTradeModel(e.target.value)}>
              <option value="">Belirtilmedi</option>
              {Object.entries(TRADE_MODEL_LABELS).map(([k, l]) => (
                <option key={k} value={k}>{l}</option>
              ))}
            </select>
          </Field>
          {dropship ? (
            <input type="hidden" name="locationId" value="" />
          ) : (
            <Field label="Konum" hint="Stoğun düşeceği yer">
              <select name="locationId" className={input}>
                <option value="">Varsayılan konum</option>
                {locations.map((l) => (
                  <option key={l.id} value={l.id}>{l.name}</option>
                ))}
              </select>
            </Field>
          )}
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
        {dropship ? (
          <div className="mt-4">
            <Note tone="warning">
              Stoksuz satış: mallar depoya girmediği için stok düşmez. Maliyet, ürünün kayıtlı alış
              fiyatından hesaplanır; kayıtlı fiyat yoksa kâr &quot;ölçülmedi&quot; olarak işaretlenir.
            </Note>
          </div>
        ) : null}
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

      <Card title="Not">
        <textarea name="note" rows={2} className={input} placeholder="Bu satışa dair not" />
      </Card>

      <div>
        <button type="submit" className={btn.primary}>Satışı kaydet</button>
      </div>
    </form>
  );
}

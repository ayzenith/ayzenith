"use client";

import { useMemo, useState } from "react";

import {
  PRICE_BAND_LABELS,
  classifyPrice,
  profitAtPrice,
  simulatorBounds,
  type PriceBand,
  type PriceInputs,
} from "@/server/product-intel/price";
import { Badge, Card, Note, Table, Td, Th, Tr, btn, input as inputCls, type BadgeTone } from "@/components/os/ui";

/**
 * PRODUCT INTELLIGENCE — the interactive price simulator.
 *
 * ONE ENGINE, TWO PLACES. This component imports `profitAtPrice`,
 * `classifyPrice` and `simulatorBounds` from the same module the stored
 * analysis was computed with. It does NOT re-implement the profit equation —
 * that is the entire design constraint. `price.ts` is a pure module with no
 * `server-only` marker and no runtime imports, which is what lets one function
 * serve a server render and a browser slider and give identical numbers. A
 * second copy of the arithmetic here would drift from the frozen analysis on
 * the first change to either, and the operator would have no way to tell which
 * screen was lying.
 *
 * Nothing here writes anything. The stored `ProductAnalysis` is immutable by
 * design; this is a what-if surface over frozen inputs, and the starting price
 * is always one click away.
 */

const BAND_TONE: Record<PriceBand, BadgeTone> = { RED: "danger", YELLOW: "warning", GREEN: "success", GRAY: "neutral" };

const fmt = (n: number | null | undefined, d = 2) =>
  n == null ? "—" : n.toLocaleString("tr-TR", { minimumFractionDigits: d, maximumFractionDigits: d });

export type SimulatorAnchor = { key: string; label: string; price: number };

export type PriceSimulatorProps = {
  /** Per-unit cost that does NOT move with the price, from the frozen analysis. */
  fixedPerUnit: number;
  inputs: PriceInputs;
  minProfitablePrice: number | null;
  targetPrice: number | null;
  marketFloor: number | null;
  marketCeiling: number | null;
  currency: string;
  /** Where the slider starts, and what "başlangıca dön" returns to. */
  initialPrice: number;
  /** Named points worth jumping to — break-even, target, market median. */
  anchors: SimulatorAnchor[];
  /** Named so the assumption can never be mistaken for a measurement. */
  costLabel: string;
  costIsAssumption: boolean;
};

type SavedRow = { id: number; label: string; price: number };

export function PriceSimulator(props: PriceSimulatorProps) {
  const { fixedPerUnit, inputs, currency, initialPrice } = props;

  const [price, setPrice] = useState<number>(initialPrice);
  const [saved, setSaved] = useState<SavedRow[]>([]);
  const [nextId, setNextId] = useState(1);

  const bounds = useMemo(
    () =>
      simulatorBounds({
        minProfitablePrice: props.minProfitablePrice,
        targetPrice: props.targetPrice,
        marketFloor: props.marketFloor,
        marketCeiling: props.marketCeiling,
        currentPrice: initialPrice,
      }),
    [props.minProfitablePrice, props.targetPrice, props.marketFloor, props.marketCeiling, initialPrice],
  );

  const at = profitAtPrice(price, fixedPerUnit, inputs);
  const band = classifyPrice(price, props.minProfitablePrice, props.targetPrice, props.marketCeiling);

  // The two advertising terms are shown apart because they behave apart: the
  // flat one sits inside `fixedPerUnit`, the percentage one moves with price.
  const adFlat = inputs.adPerUnit ?? 0;
  const adPct = at.adCost;
  const adTotal = adFlat + adPct;
  const adShareOfPrice = price > 0 ? (adTotal / price) * 100 : 0;
  const fixedWithoutAd = fixedPerUnit - adFlat;
  const hasAnyAd = adTotal > 0;

  const toBreakEven = props.minProfitablePrice == null ? null : price - props.minProfitablePrice;
  const toTarget = props.targetPrice == null ? null : price - props.targetPrice;

  const dirty = Math.abs(price - initialPrice) > 0.005;

  function addToComparison() {
    setSaved((rows) => [...rows, { id: nextId, label: `Senaryo ${rows.length + 1}`, price }]);
    setNextId((n) => n + 1);
  }

  return (
    <div className="flex flex-col gap-5">
      {props.costIsAssumption ? (
        <Note tone="warning">
          Maliyet tabanı: <strong>{props.costLabel}</strong>. Bu rakam ölçülmedi — aşağıdaki her kâr, marj ve başabaş
          sonucu bu varsayıma bağlı. Gerçek bir alış ya da ithalat analizi bağlandığında sayılar değişecektir.
        </Note>
      ) : (
        <Note>
          Maliyet tabanı: <strong>{props.costLabel}</strong>. Simülatör kayıtlı analizi değiştirmez; burada denediğin
          fiyatlar hiçbir yere yazılmaz.
        </Note>
      )}

      <Card title="Fiyat" description="Kaydırıcıyı oynat ya da doğrudan yaz — sonuçlar anında güncellenir.">
        <div className="flex flex-wrap items-end gap-4">
          <div className="min-w-[10rem] grow">
            <label className="text-caption text-subtle" htmlFor="sim-price">
              Satış fiyatı ({currency}, KDV dahil)
            </label>
            <input
              id="sim-price"
              type="number"
              inputMode="decimal"
              min={0}
              step={bounds.step}
              value={price}
              onChange={(e) => {
                const v = Number(e.target.value);
                setPrice(Number.isFinite(v) && v >= 0 ? v : 0);
              }}
              className={`${inputCls} mt-1`}
            />
          </div>
          <div className="flex shrink-0 gap-2">
            <button type="button" className={btn.secondary} onClick={addToComparison}>
              Karşılaştırmaya ekle
            </button>
            <button
              type="button"
              className={btn.ghost}
              onClick={() => setPrice(initialPrice)}
              disabled={!dirty}
              title={`Başlangıç fiyatı: ${fmt(initialPrice)} ${currency}`}
            >
              Başlangıca dön
            </button>
          </div>
        </div>

        <input
          type="range"
          aria-label="Satış fiyatı kaydırıcısı"
          min={bounds.min}
          max={bounds.max}
          step={bounds.step}
          value={Math.min(Math.max(price, bounds.min), bounds.max)}
          onChange={(e) => setPrice(Number(e.target.value))}
          className="mt-5 w-full accent-navy-950"
        />
        <div className="mt-1 flex justify-between text-caption text-subtle">
          <span>
            {fmt(bounds.min, 0)} {currency}
          </span>
          <span>
            {fmt(bounds.max, 0)} {currency}
          </span>
        </div>

        {props.anchors.length > 0 ? (
          <div className="mt-4 flex flex-wrap gap-2">
            {props.anchors.map((a) => (
              <button
                key={a.key}
                type="button"
                className={btn.ghost}
                onClick={() => setPrice(a.price)}
                title={`${fmt(a.price)} ${currency}`}
              >
                {a.label}
              </button>
            ))}
          </div>
        ) : null}
      </Card>

      <div className="grid gap-4 sm:grid-cols-4">
        <Readout label="Birim kâr" value={`${fmt(at.profit)} ${currency}`} tone={at.profit < 0 ? "negative" : "positive"} />
        <Readout label="Net marj" value={`%${fmt(at.marginPct, 1)}`} tone={at.marginPct < 0 ? "negative" : "positive"} hint="KDV hariç net gelire oranla" />
        <Readout
          label="Başabaşa uzaklık"
          value={toBreakEven == null ? "—" : `${toBreakEven >= 0 ? "+" : ""}${fmt(toBreakEven)} ${currency}`}
          tone={toBreakEven == null ? "default" : toBreakEven >= 0 ? "positive" : "negative"}
          hint={props.minProfitablePrice == null ? "Başabaş hesaplanamadı" : `Başabaş ${fmt(props.minProfitablePrice)}`}
        />
        <Readout
          label="Hedef marja uzaklık"
          value={toTarget == null ? "—" : `${toTarget >= 0 ? "+" : ""}${fmt(toTarget)} ${currency}`}
          tone={toTarget == null ? "default" : toTarget >= 0 ? "positive" : "warning"}
          hint={props.targetPrice == null ? "Hedef marja ulaşılamıyor" : `Hedef %${fmt(inputs.targetMarginPct, 1)} → ${fmt(props.targetPrice)}`}
        />
      </div>

      <Card title="Bu fiyatta ne oluyor" padded={false}>
        <Table>
          <thead>
            <Tr>
              <Th>Kalem</Th>
              <Th align="right">Tutar</Th>
              <Th>Not</Th>
            </Tr>
          </thead>
          <tbody>
            <Tr>
              <Td>Satış fiyatı (KDV dahil)</Td>
              <Td align="right">{fmt(price)}</Td>
              <Td>Müşterinin gördüğü fiyat.</Td>
            </Tr>
            <Tr>
              <Td>Net gelir (KDV hariç)</Td>
              <Td align="right">{fmt(at.netRevenue)}</Td>
              <Td>%{fmt(inputs.vatRatePct, 1)} KDV düşüldü.</Td>
            </Tr>
            <Tr>
              <Td>− Komisyon</Td>
              <Td align="right">−{fmt(at.commission)}</Td>
              <Td>
                %{fmt(inputs.commissionPct, 2)}, {inputs.commissionBase === "GROSS" ? "KDV dahil fiyat" : "net tutar"} üzerinden.
              </Td>
            </Tr>
            <Tr>
              <Td>− Reklam (oran / ACoS)</Td>
              <Td align="right">−{fmt(adPct)}</Td>
              <Td>
                {inputs.adPctOfPrice > 0
                  ? `Fiyatın %${fmt(inputs.adPctOfPrice, 1)}'i — fiyat arttıkça bu da artar.`
                  : "Oran girilmedi."}
              </Td>
            </Tr>
            <Tr>
              <Td>− Reklam (sabit)</Td>
              <Td align="right">−{fmt(adFlat)}</Td>
              <Td>{adFlat > 0 ? "Birim başına sabit — fiyattan bağımsız." : "Sabit reklam girilmedi."}</Td>
            </Tr>
            <Tr>
              <Td>− Diğer birim maliyetler</Td>
              <Td align="right">−{fmt(fixedWithoutAd)}</Td>
              <Td>Ürün maliyeti, kargo, paketleme, iade karşılığı, diğer operasyonel.</Td>
            </Tr>
            <Tr>
              <Td>
                <strong>= Birim kâr</strong>
              </Td>
              <Td align="right">
                <strong>{fmt(at.profit)}</strong>
              </Td>
              <Td>
                <Badge tone={BAND_TONE[band]}>{PRICE_BAND_LABELS[band]}</Badge>
              </Td>
            </Tr>
          </tbody>
        </Table>
      </Card>

      {hasAnyAd ? (
        <Note tone={adShareOfPrice > 30 ? "warning" : "info"}>
          Reklam toplamı bu fiyatta <strong>{fmt(adTotal)} {currency}</strong> — satış fiyatının %{fmt(adShareOfPrice, 1)}
          &apos;i. Sabit kısım ({fmt(adFlat)}) fiyat yükseldikçe oransal olarak erir; oransal kısım ({fmt(adPct)}) fiyatla
          birlikte büyür, bu yüzden fiyat yükselterek ondan kaçamazsın.
        </Note>
      ) : null}

      {saved.length > 0 ? (
        <Card
          title="Karşılaştırma"
          description="Aynı maliyet yapısıyla denenen fiyatlar."
          padded={false}
          actions={
            <button type="button" className={btn.ghost} onClick={() => setSaved([])}>
              Temizle
            </button>
          }
        >
          <Table>
            <thead>
              <Tr>
                <Th>Senaryo</Th>
                <Th align="right">Fiyat</Th>
                <Th align="right">Komisyon</Th>
                {inputs.adPctOfPrice > 0 ? <Th align="right">Reklam (oran)</Th> : null}
                <Th align="right">Birim kâr</Th>
                <Th align="right">Marj</Th>
                <Th>Bant</Th>
                <Th> </Th>
              </Tr>
            </thead>
            <tbody>
              {saved.map((row) => {
                const r = profitAtPrice(row.price, fixedPerUnit, inputs);
                const b = classifyPrice(row.price, props.minProfitablePrice, props.targetPrice, props.marketCeiling);
                return (
                  <Tr key={row.id}>
                    <Td>{row.label}</Td>
                    <Td align="right">{fmt(row.price)}</Td>
                    <Td align="right">{fmt(r.commission)}</Td>
                    {inputs.adPctOfPrice > 0 ? <Td align="right">{fmt(r.adCost)}</Td> : null}
                    <Td align="right">{fmt(r.profit)}</Td>
                    <Td align="right">%{fmt(r.marginPct, 1)}</Td>
                    <Td>
                      <Badge tone={BAND_TONE[b]}>{PRICE_BAND_LABELS[b]}</Badge>
                    </Td>
                    <Td>
                      <button type="button" className={btn.ghost} onClick={() => setPrice(row.price)}>
                        Bu fiyata git
                      </button>
                    </Td>
                  </Tr>
                );
              })}
            </tbody>
          </Table>
        </Card>
      ) : null}
    </div>
  );
}

function Readout({
  label,
  value,
  hint,
  tone = "default",
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "default" | "positive" | "negative" | "warning";
}) {
  const toneClass = {
    default: "text-foreground",
    positive: "text-success",
    negative: "text-error",
    warning: "text-warning",
  }[tone];
  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <p className="text-caption text-subtle">{label}</p>
      <p className={`mt-1 text-body font-semibold tabular-nums ${toneClass}`}>{value}</p>
      {hint ? <p className="mt-0.5 text-caption text-subtle">{hint}</p> : null}
    </div>
  );
}

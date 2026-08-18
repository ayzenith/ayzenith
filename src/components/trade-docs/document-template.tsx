import type { TradeDocumentDTO } from "@/server/os/trade-documents";
import {
  t,
  docTitle,
  docNumberLabel,
  docOrientation,
  formatDocMoney,
  formatDocDate,
  formatDocNumber,
  COMPANY_TAGLINE,
} from "@/config/trade-documents";

/**
 * AYZENITH TRADE DOCUMENT SYSTEM — the ONE template.
 *
 * This component is the entire rendering system: the live A4 preview (loaded
 * directly in an iframe at /doc/[id]/print) and the generated PDF (Puppeteer
 * navigates to that exact same URL) both render this exact tree. There is no
 * second "PDF version" anywhere — see src/app/(business)/doc/[id]/print/page.tsx
 * and src/server/os/pdf.ts.
 *
 * Design language: AYZENITH navy/gold on white paper, hairline rules instead of
 * boxes, strong heading hierarchy — the same premium-B2B print language already
 * proven in docs/AYZENITH-Katalog.html, translated into the four commercial
 * document types.
 */

export function DocumentTemplate({ data }: { data: TradeDocumentDTO }) {
  const lang = data.language;
  const orientation = docOrientation(data.docType);
  const pageWidth = orientation === "landscape" ? "297mm" : "210mm";
  const pageMinHeight = orientation === "landscape" ? "210mm" : "297mm";
  const isPackingList = data.docType === "PACKING_LIST";
  const isQuotation = data.docType === "QUOTATION";
  const showMoney = !isPackingList;
  const bill = data.sale.customer;
  const company = data.company;

  return (
    <div
      lang={lang.toLowerCase()}
      className="doc-page relative mx-auto bg-white font-sans text-[#131E29]"
      style={{ width: pageWidth, minHeight: pageMinHeight, padding: "18mm 22mm 16mm", boxSizing: "border-box" }}
    >
      {data.status === "DRAFT" ? (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 flex items-center justify-center overflow-hidden"
          style={{ zIndex: 0 }}
        >
          <span className="rotate-[-32deg] whitespace-nowrap text-[6rem] font-bold tracking-[0.04em] text-navy-900/[0.06]">
            {t(lang, "draft")}
          </span>
        </div>
      ) : null}

      <div className="relative" style={{ zIndex: 1 }}>
        {/* ---------------------------------------------------------------- Header */}
        <header className="flex items-start justify-between gap-8 border-b border-navy-900/15 pb-5">
          <div className="min-w-0">
            {company.companyLogoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={company.companyLogoUrl}
                alt={company.companyTradingName ?? "AYZENITH"}
                className="mb-2 h-9 max-w-[180px] object-contain object-left"
                onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
              />
            ) : null}
            {!company.companyLogoUrl && (
              <p className="font-serif text-2xl font-medium tracking-tight text-navy-950">{company.companyTradingName}</p>
            )}
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-gold-700">{COMPANY_TAGLINE}</p>
          </div>
          <div className="shrink-0 text-right">
            <p className="font-serif text-[1.7rem] font-medium leading-none tracking-tight text-navy-950">{docTitle(lang, data.docType)}</p>
            <dl className="mt-2.5 space-y-0.5 text-[11px] text-[#4A5A69]">
              <div className="flex justify-end gap-2">
                <dt className="font-medium text-[#8B98A4]">{docNumberLabel(lang, data.docType)}</dt>
                <dd className="font-semibold text-navy-950">{data.code}{data.version > 1 ? ` (v${data.version})` : ""}</dd>
              </div>
              <div className="flex justify-end gap-2">
                <dt className="font-medium text-[#8B98A4]">{t(lang, "date")}</dt>
                <dd>{formatDocDate(data.issuedAt, lang)}</dd>
              </div>
              {data.validUntil ? (
                <div className="flex justify-end gap-2">
                  <dt className="font-medium text-[#8B98A4]">{t(lang, "validUntil")}</dt>
                  <dd>{formatDocDate(data.validUntil, lang)}</dd>
                </div>
              ) : null}
            </dl>
          </div>
        </header>

        {/* ---------------------------------------------------------------- From / Bill To / Ship To */}
        <section className={`mt-6 grid gap-8 ${data.shipTo ? "grid-cols-3" : "grid-cols-2"}`}>
          <PartyBlock label={t(lang, "from")}>
            <p className="font-medium text-navy-950">{company.companyLegalName}</p>
            {company.companyAddress ? <p>{company.companyAddress}</p> : null}
            {[company.companyCity, company.companyCountry].filter(Boolean).length ? (
              <p>{[company.companyCity, company.companyCountry].filter(Boolean).join(", ")}</p>
            ) : null}
            {company.companyVatNumber ? <p>{t(lang, "vatNumber")}: {company.companyVatNumber}</p> : null}
            {company.companyTaxNumber ? <p>{t(lang, "taxNumber")}: {company.companyTaxNumber}</p> : null}
            {company.companyEmail ? <p>{company.companyEmail}</p> : null}
            {company.companyPhone ? <p>{company.companyPhone}</p> : null}
          </PartyBlock>

          <PartyBlock label={t(lang, "billTo")}>
            {bill ? (
              <>
                <p className="font-medium text-navy-950">{bill.legalName || bill.name}</p>
                {bill.address ? <p>{bill.address}</p> : null}
                {[bill.city, bill.country].filter(Boolean).length ? <p>{[bill.city, bill.country].filter(Boolean).join(", ")}</p> : null}
                {bill.taxNumber ? <p>{t(lang, "taxNumber")}: {bill.taxNumber}</p> : null}
                {bill.email ? <p>{bill.email}</p> : null}
                {bill.phone ? <p>{bill.phone}</p> : null}
              </>
            ) : (
              <p className="italic text-[#8B98A4]">—</p>
            )}
          </PartyBlock>

          {data.shipTo ? (
            <PartyBlock label={t(lang, "shipTo")}>
              <p className="font-medium text-navy-950">{data.shipTo.name || bill?.name}</p>
              {data.shipTo.address ? <p>{data.shipTo.address}</p> : null}
              {[data.shipTo.city, data.shipTo.country].filter(Boolean).length ? (
                <p>{[data.shipTo.city, data.shipTo.country].filter(Boolean).join(", ")}</p>
              ) : null}
            </PartyBlock>
          ) : null}
        </section>

        {/* ---------------------------------------------------------------- Line items */}
        <section className="mt-7">
          <table className="w-full border-collapse text-[11px]">
            <thead style={{ display: "table-header-group" }}>
              <tr className="border-b border-t border-navy-900/20 bg-[#F5F6F8]">
                <Th>{t(lang, "description")}</Th>
                {data.show.hsCode ? <Th>{t(lang, "hsCode")}</Th> : null}
                {data.show.countryOfOrigin ? <Th>{t(lang, "countryOfOrigin")}</Th> : null}
                <Th align="right">{t(lang, "quantity")}</Th>
                <Th>{t(lang, "unit")}</Th>
                {isPackingList ? (
                  <>
                    <Th align="right">{t(lang, "packages")}</Th>
                    <Th align="right">{t(lang, "netWeight")}</Th>
                    <Th align="right">{t(lang, "grossWeight")}</Th>
                    <Th>{t(lang, "dimensions")}</Th>
                  </>
                ) : null}
                {showMoney ? (
                  <>
                    <Th align="right">{t(lang, "unitPrice")}</Th>
                    {data.show.vat ? <Th align="right">{t(lang, "vat")}</Th> : null}
                    <Th align="right">{t(lang, "amount")}</Th>
                  </>
                ) : null}
              </tr>
            </thead>
            <tbody>
              {data.lines.map((l) => (
                <tr key={l.id} className="border-b border-navy-900/10" style={{ breakInside: "avoid" }}>
                  <Td>
                    <span className="font-medium text-navy-950">{l.name}</span>
                    <span className="block text-[#8B98A4]">{l.sku}</span>
                  </Td>
                  {data.show.hsCode ? <Td>{l.hsCode || "—"}</Td> : null}
                  {data.show.countryOfOrigin ? <Td>{l.countryOfOrigin || "—"}</Td> : null}
                  <Td align="right">{formatDocNumber(l.quantity, lang)}</Td>
                  <Td>{l.unit}</Td>
                  {isPackingList ? (
                    <>
                      <Td align="right">{l.packages ?? "—"}</Td>
                      <Td align="right">{l.netWeight != null ? `${formatDocNumber(l.netWeight, lang)} kg` : "—"}</Td>
                      <Td align="right">{l.grossWeight != null ? `${formatDocNumber(l.grossWeight, lang)} kg` : "—"}</Td>
                      <Td>{l.dimensions || "—"}</Td>
                    </>
                  ) : null}
                  {showMoney ? (
                    <>
                      <Td align="right">{formatDocMoney(l.unitPrice, data.currency, lang)}</Td>
                      {data.show.vat ? <Td align="right">{l.vatRate ? `${formatDocNumber(l.vatRate, lang, 2)}%` : "—"}</Td> : null}
                      <Td align="right" className="font-medium text-navy-950">{formatDocMoney(l.lineTotal, data.currency, lang)}</Td>
                    </>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        {/* ---------------------------------------------------------------- Totals */}
        {isPackingList ? (
          <section className="mt-4 flex justify-end">
            <table className="w-64 text-[11px]">
              <tbody>
                <TotalRow label={t(lang, "totalPackages")} value={String(data.totals.totalPackages)} />
                <TotalRow label={t(lang, "totalNetWeight")} value={`${formatDocNumber(data.totals.totalNetWeight, lang)} kg`} />
                <TotalRow label={t(lang, "totalGrossWeight")} value={`${formatDocNumber(data.totals.totalGrossWeight, lang)} kg`} bold />
              </tbody>
            </table>
          </section>
        ) : (
          <section className="mt-4 flex justify-end">
            <table className="w-72 text-[11px]">
              <tbody>
                <TotalRow label={t(lang, "subtotal")} value={formatDocMoney(data.totals.subtotal, data.currency, lang)} />
                {data.totals.discountTotal > 0.004 ? (
                  <TotalRow label={t(lang, "discount")} value={`− ${formatDocMoney(data.totals.discountTotal, data.currency, lang)}`} />
                ) : null}
                {data.show.vat && data.totals.vatTotal > 0.004 ? (
                  <TotalRow label={t(lang, "vat")} value={formatDocMoney(data.totals.vatTotal, data.currency, lang)} muted />
                ) : null}
                <tr>
                  <td colSpan={2} className="pt-2">
                    <div className="flex items-baseline justify-between border-t-2 border-navy-950 pt-2">
                      <span className="text-[11px] font-semibold uppercase tracking-wide text-navy-950">{t(lang, "grandTotal")}</span>
                      <span className="font-serif text-xl font-medium text-navy-950">{formatDocMoney(data.totals.total, data.currency, lang)}</span>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </section>
        )}

        {/* ---------------------------------------------------------------- Commercial terms */}
        <section className="mt-7 grid grid-cols-3 gap-x-8 gap-y-3 border-t border-navy-900/15 pt-5 text-[11px]">
          <TermField label={t(lang, "paymentTerms")} value={data.paymentTermsOverride || (data.sale.paymentTermDays ? `${data.sale.paymentTermDays} ${lang === "TR" ? "gün" : lang === "DE" ? "Tage" : "days"}` : null)} />
          <TermField label={t(lang, "deliveryTerms")} value={data.deliveryTermsOverride} />
          {data.incoterm ? <TermField label={t(lang, "incoterm")} value={data.incoterm} /> : null}
          {data.shippingMethod ? <TermField label={t(lang, "shippingMethod")} value={data.shippingMethod} /> : null}
          {data.show.countryOfOrigin && data.countryOfOrigin ? <TermField label={t(lang, "countryOfOrigin")} value={data.countryOfOrigin} /> : null}
          <TermField label={t(lang, "currency")} value={data.currency} />
        </section>

        {/* ---------------------------------------------------------------- Notes */}
        {data.customerNote || data.paymentNote || data.deliveryNote || data.specialTerms ? (
          <section className="mt-5 space-y-2.5 text-[11px]">
            {data.customerNote ? <NoteBlock label={isQuotation ? t(lang, "notes") : t(lang, "customerNote")} value={data.customerNote} /> : null}
            {data.paymentNote ? <NoteBlock label={t(lang, "paymentNote")} value={data.paymentNote} /> : null}
            {data.deliveryNote ? <NoteBlock label={t(lang, "deliveryNote")} value={data.deliveryNote} /> : null}
            {data.specialTerms ? <NoteBlock label={t(lang, "specialTerms")} value={data.specialTerms} /> : null}
          </section>
        ) : null}

        {/* ---------------------------------------------------------------- Bank + Signature */}
        <section className="mt-6 grid grid-cols-2 gap-8" style={{ breakInside: "avoid" }}>
          {data.show.bankDetails && data.bankAccount ? (
            <div>
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-gold-700">{t(lang, "bankDetails")}</p>
              <dl className="space-y-0.5 text-[11px] text-[#4A5A69]">
                <div className="flex gap-2"><dt className="w-28 shrink-0 text-[#8B98A4]">{t(lang, "bankName")}</dt><dd>{data.bankAccount.bankName}</dd></div>
                <div className="flex gap-2"><dt className="w-28 shrink-0 text-[#8B98A4]">{t(lang, "accountHolder")}</dt><dd>{data.bankAccount.accountHolder}</dd></div>
                {data.bankAccount.iban ? <div className="flex gap-2"><dt className="w-28 shrink-0 text-[#8B98A4]">{t(lang, "iban")}</dt><dd className="font-mono">{data.bankAccount.iban}</dd></div> : null}
                {data.bankAccount.swift ? <div className="flex gap-2"><dt className="w-28 shrink-0 text-[#8B98A4]">{t(lang, "swift")}</dt><dd className="font-mono">{data.bankAccount.swift}</dd></div> : null}
              </dl>
            </div>
          ) : <div />}

          {data.show.signature && data.signatory ? (
            <div className="text-right">
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-gold-700">{t(lang, "authorizedSignatory")}</p>
              {data.signatory.signatureUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={data.signatory.signatureUrl} alt={data.signatory.name ?? ""} className="ml-auto mb-1 h-12 object-contain object-right" />
              ) : (
                <div className="mb-3 h-8" />
              )}
              <p className="font-medium text-navy-950">{data.signatory.name}</p>
              {data.signatory.title ? <p className="text-[#4A5A69]">{data.signatory.title}</p> : null}
            </div>
          ) : <div />}
        </section>

        {/* ---------------------------------------------------------------- Footer */}
        <footer className="mt-6 border-t border-navy-900/15 pt-3 text-center text-[9px] text-[#8B98A4]">
          {data.footerNote ? <p className="mb-1">{data.footerNote}</p> : null}
          <p>{t(lang, "footerLegal")}</p>
          <p className="mt-1">{company.companyTradingName} · {[company.companyWebsite, company.companyEmail].filter(Boolean).join(" · ")}</p>
        </footer>
      </div>
    </div>
  );
}

function PartyBlock({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-gold-700">{label}</p>
      <div className="space-y-0.5 text-[11px] leading-[1.5] text-[#4A5A69]">{children}</div>
    </div>
  );
}

function Th({ children, align = "left" }: { children: React.ReactNode; align?: "left" | "right" }) {
  return (
    <th className={`px-2.5 py-2 text-[9.5px] font-semibold uppercase tracking-wide text-[#4A5A69] ${align === "right" ? "text-right" : "text-left"}`}>
      {children}
    </th>
  );
}

function Td({ children, align = "left", className = "" }: { children: React.ReactNode; align?: "left" | "right"; className?: string }) {
  return <td className={`px-2.5 py-2 align-top ${align === "right" ? "text-right" : "text-left"} ${className}`}>{children}</td>;
}

function TotalRow({ label, value, bold, muted }: { label: string; value: string; bold?: boolean; muted?: boolean }) {
  return (
    <tr>
      <td className={`py-1 ${muted ? "text-[#8B98A4]" : "text-[#4A5A69]"}`}>{label}</td>
      <td className={`py-1 text-right tabular-nums ${bold ? "font-semibold text-navy-950" : muted ? "text-[#8B98A4]" : "text-navy-950"}`}>{value}</td>
    </tr>
  );
}

function TermField({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <div>
      <p className="text-[9.5px] font-medium uppercase tracking-wide text-[#8B98A4]">{label}</p>
      <p className="mt-0.5 text-navy-950">{value}</p>
    </div>
  );
}

function NoteBlock({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[9.5px] font-medium uppercase tracking-wide text-[#8B98A4]">{label}</p>
      <p className="mt-0.5 whitespace-pre-line text-[#4A5A69]">{value}</p>
    </div>
  );
}

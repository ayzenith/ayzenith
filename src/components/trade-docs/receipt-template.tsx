import type { ReceiptData } from "@/server/os/receipts";
import { formatMoney, formatDate } from "@/config/os";

/**
 * Simple A4 receipt/voucher — Payments, Expenses, Tax records. Deliberately
 * plainer than DocumentTemplate (no multi-language, no line-item table): one
 * transaction, one figure, one printable proof with the company's own logo.
 */

export function ReceiptTemplate({ data }: { data: ReceiptData }) {
  const { company } = data;
  return (
    <div
      lang="tr"
      className="relative mx-auto bg-white font-sans text-[#131E29]"
      style={{ width: "210mm", minHeight: "297mm", padding: "20mm 24mm", boxSizing: "border-box" }}
    >
      <header className="flex items-start justify-between gap-8 border-b border-navy-900/15 pb-6">
        <div className="min-w-0">
          {company.companyLogoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={company.companyLogoUrl}
              alt={company.companyTradingName ?? "AYZENITH"}
              className="mb-2 h-11 max-w-[190px] object-contain object-left"
            />
          ) : null}
          {!company.companyLogoUrl && (
            <p className="font-serif text-2xl font-medium tracking-tight text-navy-950">{company.companyTradingName}</p>
          )}
        </div>
        <div className="shrink-0 text-right">
          <p className="font-serif text-[1.5rem] font-medium leading-none tracking-tight text-navy-950">{data.title}</p>
          <dl className="mt-2.5 space-y-0.5 text-[11px] text-[#4A5A69]">
            <div className="flex justify-end gap-2"><dt className="font-medium text-[#8B98A4]">Belge No</dt><dd className="font-semibold text-navy-950">{data.receiptNo}</dd></div>
            <div className="flex justify-end gap-2"><dt className="font-medium text-[#8B98A4]">Tarih</dt><dd>{formatDate(data.date)}</dd></div>
          </dl>
        </div>
      </header>

      <section className="mt-8">
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-gold-700">Düzenleyen</p>
        <p className="font-medium text-navy-950">{company.companyLegalName}</p>
        {company.companyAddress ? <p className="text-[11px] text-[#4A5A69]">{company.companyAddress}</p> : null}
        {[company.companyCity, company.companyCountry].filter(Boolean).length ? (
          <p className="text-[11px] text-[#4A5A69]">{[company.companyCity, company.companyCountry].filter(Boolean).join(", ")}</p>
        ) : null}
      </section>

      <section className="mt-8 grid grid-cols-2 gap-x-8 gap-y-4 border-t border-navy-900/15 pt-6 text-[11px]">
        {data.partyName ? (
          <div><p className="font-medium uppercase tracking-wide text-[#8B98A4]">Firma</p><p className="mt-0.5 text-navy-950">{data.partyName}</p></div>
        ) : null}
        <div><p className="font-medium uppercase tracking-wide text-[#8B98A4]">Açıklama</p><p className="mt-0.5 text-navy-950">{data.description}</p></div>
        {data.method ? (
          <div><p className="font-medium uppercase tracking-wide text-[#8B98A4]">Yöntem</p><p className="mt-0.5 text-navy-950">{data.method}</p></div>
        ) : null}
        <div><p className="font-medium uppercase tracking-wide text-[#8B98A4]">Durum</p><p className="mt-0.5 text-navy-950">{data.status}</p></div>
      </section>

      <section className="mt-8 border-t-2 border-navy-950 pt-4">
        <div className="flex items-baseline justify-between">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-navy-950">Tutar</span>
          <span className="font-serif text-3xl font-medium text-navy-950">{formatMoney(data.amount, data.currency)}</span>
        </div>
      </section>

      {data.note ? (
        <section className="mt-6 text-[11px]">
          <p className="font-medium uppercase tracking-wide text-[#8B98A4]">Not</p>
          <p className="mt-0.5 whitespace-pre-line text-[#4A5A69]">{data.note}</p>
        </section>
      ) : null}

      {data.signatory ? (
        <section className="mt-10 flex justify-end" style={{ breakInside: "avoid" }}>
          <div className="text-right">
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-gold-700">Yetkili İmza</p>
            {data.signatory.signatureUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={data.signatory.signatureUrl}
                alt={data.signatory.name}
                className="ml-auto mb-1 h-12 object-contain object-right"
                onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
              />
            ) : null}
            {!data.signatory.signatureUrl && (
              <div className="mb-3 h-8" />
            )}
            <p className="font-medium text-navy-950">{data.signatory.name}</p>
            {data.signatory.title ? <p className="text-[11px] text-[#4A5A69]">{data.signatory.title}</p> : null}
          </div>
        </section>
      ) : null}

      <footer className="mt-10 border-t border-navy-900/15 pt-3 text-center text-[9px] text-[#8B98A4]">
        <p>Bu belge elektronik olarak oluşturulmuştur ve aksi belirtilmedikçe imzasız geçerlidir.</p>
        <p className="mt-1">{company.companyTradingName} · {[company.companyWebsite, company.companyEmail].filter(Boolean).join(" · ")}</p>
      </footer>
    </div>
  );
}

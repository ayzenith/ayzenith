import type { ReportData } from "@/server/os/report-pdf";
import { COMPANY_TAGLINE } from "@/config/trade-documents";
import { formatDate } from "@/config/os";

/** A plain, logo-headed table dump of a list/report screen — Finans, Ürünler, Stok. */

export function ReportTemplate({ data }: { data: ReportData }) {
  const { company } = data;
  return (
    <div lang="tr" className="relative mx-auto bg-white font-sans text-[#131E29]" style={{ width: "210mm", minHeight: "297mm", padding: "18mm 20mm 16mm", boxSizing: "border-box" }}>
      <header className="flex items-start justify-between gap-8 border-b border-navy-900/15 pb-5">
        <div className="min-w-0">
          {company.companyLogoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={company.companyLogoUrl}
              alt={company.companyTradingName ?? "AYZENITH"}
              className="mb-2 h-10 max-w-[180px] object-contain object-left"
              onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
            />
          ) : null}
          {!company.companyLogoUrl && (
            <p className="font-serif text-2xl font-medium tracking-tight text-navy-950">{company.companyTradingName}</p>
          )}
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-gold-700">{COMPANY_TAGLINE}</p>
        </div>
        <div className="shrink-0 text-right">
          <p className="font-serif text-[1.4rem] font-medium leading-none tracking-tight text-navy-950">{data.title}</p>
          <p className="mt-2 text-[11px] text-[#8B98A4]">{formatDate(data.generatedAt)}</p>
        </div>
      </header>

      {data.summary.length ? (
        <section className="mt-5 flex flex-wrap gap-x-10 gap-y-2 border-b border-navy-900/10 pb-4 text-[11px]">
          {data.summary.map((s) => (
            <div key={s.label}>
              <p className="font-medium uppercase tracking-wide text-[#8B98A4]">{s.label}</p>
              <p className="mt-0.5 font-semibold text-navy-950">{s.value}</p>
            </div>
          ))}
        </section>
      ) : null}

      <section className="mt-5">
        <table className="w-full border-collapse text-[10.5px]">
          <thead style={{ display: "table-header-group" }}>
            <tr className="border-b border-t border-navy-900/20 bg-[#F5F6F8]">
              {data.columns.map((c) => (
                <th key={c.header} className={`px-2 py-2 text-[9.5px] font-semibold uppercase tracking-wide text-[#4A5A69] ${c.align === "right" ? "text-right" : "text-left"}`}>
                  {c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.rows.map((row, i) => (
              <tr key={i} className="border-b border-navy-900/10" style={{ breakInside: "avoid" }}>
                {row.map((cell, j) => (
                  <td key={j} className={`px-2 py-1.5 align-top ${data.columns[j]?.align === "right" ? "text-right tabular-nums" : "text-left"}`}>
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <footer className="mt-8 border-t border-navy-900/15 pt-3 text-center text-[9px] text-[#8B98A4]">
        <p>{company.companyTradingName} · {[company.companyWebsite, company.companyEmail].filter(Boolean).join(" · ")}</p>
      </footer>
    </div>
  );
}

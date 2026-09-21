/**
 * IMPORT INTELLIGENCE — official source ingestion (operator script).
 *
 *   npx tsx scripts/import-intelligence/ingest.ts [--only=KEY,KEY] [--dry] [--convert]
 *
 * What it does, per source: download the file the publisher serves, hash it,
 * record that VERSION, parse it, and replace that version's rows. Re-running it
 * with unchanged files is a no-op beyond a fresh `lastCheckedAt`.
 *
 * The Turkish tariff schedule is published as legacy .xls (BIFF), which no
 * dependency in this project can read. `--convert` converts the chapter files
 * to .xlsx with the locally installed Excel (Windows COM) into
 * `.import-intel-cache/tgtc-xlsx`; the ORIGINAL zip is what gets hashed and
 * recorded, and the conversion is written into the source's extractionMethod.
 * On a machine without Excel, convert the files by any other means and drop the
 * .xlsx files into that folder.
 *
 * NOTE: this writes to whatever database DATABASE_URL points at — in this
 * project that is production. It only ever touches Import Intelligence tables.
 */

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { inflateSync } from "node:zlib";
import { readXlsx, type SheetRows } from "../../src/server/import/xlsx";
import { fetchBytes, SOURCE_CATALOGUE } from "../../src/server/import/sources";
import {
  ingestCommuniques, ingestCountryGroups, ingestHs, ingestIgvEk1, ingestIrkIIList, ingestMeasures,
  ingestSafeguards, ingestTgtc, ingestUgdGroups, ingestVatRates, recordTara, type IngestSummary,
} from "../../src/server/import/ingest";
import { db } from "../../src/lib/db";

const CACHE = resolve(".import-intel-cache");
const args = process.argv.slice(2);
const only = args.find((a) => a.startsWith("--only="))?.slice(7).split(",").filter(Boolean) ?? null;
const dry = args.includes("--dry");
const convert = args.includes("--convert");
const wanted = (key: string) => !only || only.includes(key);

function cachePath(...parts: string[]) {
  const p = join(CACHE, ...parts);
  mkdirSync(resolve(p, ".."), { recursive: true });
  return p;
}

async function download(key: string, url: string): Promise<{ bytes: Uint8Array; lastModified: string | null } | null> {
  const file = cachePath(`${key}.bin`);
  const metaFile = cachePath(`${key}.meta.json`);
  if (existsSync(file) && args.includes("--use-cache")) {
    const meta = existsSync(metaFile) ? JSON.parse(readFileSync(metaFile, "utf8")) : {};
    console.log(`  ${key}: önbellekten (${file})`);
    return { bytes: new Uint8Array(readFileSync(file)), lastModified: meta.lastModified ?? null };
  }
  process.stdout.write(`  ${key}: indiriliyor… `);
  const res = await fetchBytes(url, 180_000);
  if (!res.ok) {
    console.log(`ERİŞİLEMEDİ (${res.error})`);
    return null;
  }
  writeFileSync(file, res.bytes);
  writeFileSync(metaFile, JSON.stringify({ url, lastModified: res.lastModified, etag: res.etag, size: res.bytes.byteLength }, null, 2));
  console.log(`${(res.bytes.byteLength / 1024).toFixed(0)} KB, last-modified: ${res.lastModified ?? "yok"}`);
  return { bytes: res.bytes, lastModified: res.lastModified };
}

/** Expand a downloaded zip with the OS (no zip dependency in the app). */
function unzip(key: string, bytes: Uint8Array): string {
  const zipPath = cachePath(`${key}.zip`);
  const outDir = cachePath(`${key}-files`);
  writeFileSync(zipPath, bytes);
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });
  if (process.platform === "win32") {
    execFileSync("powershell.exe", ["-NoProfile", "-Command", `Expand-Archive -LiteralPath '${zipPath}' -DestinationPath '${outDir}' -Force`], { stdio: "pipe" });
  } else {
    execFileSync("unzip", ["-o", "-q", zipPath, "-d", outDir], { stdio: "pipe" });
  }
  return outDir;
}

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]));
}

/** .xls → .xlsx with the locally installed Excel. */
function convertXlsDir(srcDir: string, dstDir: string) {
  mkdirSync(dstDir, { recursive: true });
  const ps = `
$x = New-Object -ComObject Excel.Application
$x.DisplayAlerts = $false
Get-ChildItem -LiteralPath '${srcDir}' -Filter *.xls | ForEach-Object {
  $wb = $x.Workbooks.Open($_.FullName, 0, $true)
  $wb.SaveAs((Join-Path '${dstDir}' ($_.BaseName + '.xlsx')), 51)
  $wb.Close($false)
}
$x.Quit()
`;
  execFileSync("powershell.exe", ["-NoProfile", "-Command", ps], { stdio: "inherit" });
}

async function sheetsOf(file: string): Promise<SheetRows[]> {
  return readXlsx(new Uint8Array(readFileSync(file)));
}

/** Crude PDF text extraction: inflate the content streams and read the literal strings. */
function pdfText(bytes: Uint8Array): string {
  const buf = Buffer.from(bytes);
  const s = buf.toString("latin1");
  const parts: string[] = [];
  let i = 0;
  for (;;) {
    const k = s.indexOf("stream", i);
    if (k < 0) break;
    if (s.slice(k - 3, k) === "end") {
      i = k + 6;
      continue;
    }
    let st = k + 6;
    if (s[st] === "\r") st += 1;
    if (s[st] === "\n") st += 1;
    const e = s.indexOf("endstream", st);
    if (e < 0) break;
    i = e + 9;
    let d: string;
    try {
      d = inflateSync(buf.subarray(st, e)).toString("latin1");
    } catch {
      continue;
    }
    if (!d.includes("BT")) continue;
    let p = 0;
    let line = "";
    while (p < d.length) {
      if (d[p] === "(") {
        let depth = 1;
        let q = p + 1;
        let txt = "";
        while (q < d.length && depth > 0) {
          const ch = d[q]!;
          if (ch === "\\") {
            txt += d[q + 1] ?? "";
            q += 2;
            continue;
          }
          if (ch === "(") depth += 1;
          if (ch === ")") {
            depth -= 1;
            if (depth === 0) break;
          }
          txt += ch;
          q += 1;
        }
        line += `${txt} `;
        p = q + 1;
        continue;
      }
      p += 1;
    }
    parts.push(line);
  }
  return parts.join("\n");
}

const summaries: IngestSummary[] = [];
function report(s: IngestSummary | null) {
  if (!s) return;
  summaries.push(s);
  console.log(`  → ${s.key}: ${s.isNew ? "YENİ SÜRÜM" : "aynı sürüm"} | ${Object.entries(s.counts).map(([k, v]) => `${k}=${v}`).join(" ") || "—"}${s.warnings.length ? ` | ${s.warnings.length} uyarı` : ""}`);
  for (const w of s.warnings.slice(0, 8)) console.log(`      ! ${w}`);
}

async function main() {
  console.log(`Import Intelligence kaynak yükleme${dry ? " (DRY RUN — veritabanına yazılmaz)" : ""}\n`);

  // 1. Turkish tariff schedule (TGTC).
  if (wanted("TR_TGTC")) {
    console.log("TGTC — Türk Gümrük Tarife Cetveli");
    const dl = await download("TR_TGTC", SOURCE_CATALOGUE.TR_TGTC.url);
    const page = await download("TR_TGTC_PAGE", SOURCE_CATALOGUE.TR_TGTC.page!);
    if (dl) {
      const dir = unzip("TR_TGTC", dl.bytes);
      const xlsFiles = walk(dir).filter((f) => f.toLowerCase().endsWith(".xls") && /fas[ıi]l/i.test(f));
      const xlsxDir = cachePath("tgtc-xlsx");
      if (convert || !existsSync(xlsxDir) || readdirSync(xlsxDir).length === 0) {
        const chaptersDir = xlsFiles[0] ? resolve(xlsFiles[0], "..") : null;
        if (!chaptersDir) throw new Error("Zip içinde fasıl .xls dosyası bulunamadı.");
        console.log(`  ${xlsFiles.length} .xls dosyası .xlsx'e çevriliyor (Excel)…`);
        convertXlsDir(chaptersDir, xlsxDir);
      }
      const chapters = [];
      for (const f of readdirSync(xlsxDir).filter((f) => f.endsWith(".xlsx") && /fas[ıi]l/i.test(f))) {
        chapters.push({ file: f, sheets: await sheetsOf(join(xlsxDir, f)) });
      }
      console.log(`  ${chapters.length} fasıl dosyası okundu.`);
      if (!dry) {
        report(await ingestTgtc({
          zipBytes: dl.bytes,
          chapters,
          pageHtml: page ? Buffer.from(page.bytes).toString("utf8") : null,
          version: "2026",
          extractionMethod: "ZIP → fasıl .xls → .xlsx (yerel Excel) → exceljs; hiyerarşi tire derinliğinden kurulur",
        }));
      }
    }
  }

  // 2. HS 2022 reference list.
  if (wanted("WCO_HS2022_UN")) {
    console.log("\nHS 2022 (UN Comtrade H6)");
    const dl = await download("WCO_HS2022_UN", SOURCE_CATALOGUE.WCO_HS2022_UN.url);
    if (dl && !dry) report(await ingestHs({ bytes: dl.bytes, json: JSON.parse(Buffer.from(dl.bytes).toString("utf8")) }));
  }

  // 3. Import Regime Decision — II Sayılı Liste + country groups.
  if (wanted("TR_IRK_II_LIST")) {
    console.log("\nİthalat Rejimi Kararı — II Sayılı Liste");
    const dl = await download("TR_IRK_II_LIST", SOURCE_CATALOGUE.TR_IRK_II_LIST.url);
    const page = await download("TR_IRK_PAGE", SOURCE_CATALOGUE.TR_IRK_II_LIST.page!);
    if (dl) {
      const dir = unzip("TR_IRK", dl.bytes);
      const files = [];
      for (const f of walk(dir).filter((f) => /II\s*say.*Liste.*\.xlsx$/i.test(f))) {
        files.push({ file: f.split(/[\\/]/).pop()!, sheets: await sheetsOf(f) });
      }
      console.log(`  ${files.length} liste dosyası okundu.`);
      const pageHtml = page ? Buffer.from(page.bytes).toString("utf8") : null;
      if (!dry) report(await ingestIrkIIList({ zipBytes: dl.bytes, files, pageHtml, version: "2026" }));

      // Country groups: the abbreviations .docx and the GSP annex.
      const docx = walk(dir).find((f) => /Kısaltmalar.*\.docx$/i.test(f) || /K.*saltmalar.*\.docx$/i.test(f));
      const ek1 = walk(dir).find((f) => /EK-1\.xlsx$/i.test(f));
      let headings = "";
      let gts = "";
      if (docx) {
        const docDir = unzip("TR_IRK_DOCX", new Uint8Array(readFileSync(docx)));
        const xml = walk(docDir).find((f) => f.endsWith("document.xml"));
        if (xml) headings = readFileSync(xml, "utf8").replace(/<\/w:p>/g, "\n").replace(/<[^>]*>/g, "");
      }
      if (ek1) {
        const sheets = await sheetsOf(ek1);
        gts = (sheets[0]?.rows ?? []).map((r) => r.map((c) => c.text).filter(Boolean).join(" | ")).join("\n");
      }
      if (!dry && (headings || gts)) report(await ingestCountryGroups({ zipBytes: dl.bytes, columnHeadingsText: headings, gtsCountryText: gts, version: "2026" }));
      else if (!headings && !gts) console.log("  ! Ülke grubu dosyaları (docx / EK-1) bulunamadı.");
    }
  }

  // 4. Additional customs duty (İGV) Ek-1.
  if (wanted("TR_IGV_EK1")) {
    console.log("\nİGV Kararı — Ek-1");
    const dl = await download("TR_IGV_EK1", SOURCE_CATALOGUE.TR_IGV_EK1.url);
    const page = await download("TR_IGV_PAGE", SOURCE_CATALOGUE.TR_IGV_EK1.page!);
    if (dl) {
      const dir = unzip("TR_IGV", dl.bytes);
      const files = [];
      for (const f of walk(dir).filter((f) => /EK-?1\.xlsx$/i.test(f))) {
        files.push({ file: f.split(/[\\/]/).pop()!, sheets: await sheetsOf(f) });
      }
      // Ek-2 / Ek-3 carry country-specific columns (agricultural and processed
      // goods) — reported, deliberately not ingested in V1.
      const others = walk(dir).filter((f) => /EK\s*2|EK-2|EK 2 -3/i.test(f));
      console.log(`  Ek-1: ${files.length} dosya; V1'de yüklenmeyen diğer tablolar: ${others.length}`);
      if (!dry) report(await ingestIgvEk1({ zipBytes: dl.bytes, files, pageHtml: page ? Buffer.from(page.bytes).toString("utf8") : null, version: "2026" }));
    }
  }

  // 5. Trade defence.
  if (wanted("TR_TRADE_DEFENCE_AD")) {
    console.log("\nDamping / sübvansiyon önlemleri");
    const dl = await download("TR_TRADE_DEFENCE_AD", SOURCE_CATALOGUE.TR_TRADE_DEFENCE_AD.url);
    if (dl) {
      const sheets = await readXlsx(dl.bytes);
      const listDate = /(\d{2})\.(\d{2})\.(\d{4})/.exec(SOURCE_CATALOGUE.TR_TRADE_DEFENCE_AD.url);
      if (!dry) {
        report(await ingestMeasures({
          bytes: dl.bytes,
          sheets,
          listDate: listDate ? new Date(Date.UTC(Number(listDate[3]), Number(listDate[2]) - 1, Number(listDate[1]))) : null,
          lastModified: dl.lastModified,
        }));
      }
    }
  }
  if (wanted("TR_TRADE_DEFENCE_SG")) {
    console.log("\nKorunma önlemleri");
    const dl = await download("TR_TRADE_DEFENCE_SG", SOURCE_CATALOGUE.TR_TRADE_DEFENCE_SG.url);
    if (dl && !dry) report(await ingestSafeguards({ bytes: dl.bytes, sheets: await readXlsx(dl.bytes), lastModified: dl.lastModified }));
  }

  // 6. Product-safety groups and special import regimes.
  if (wanted("TR_UGD_GROUPS")) {
    console.log("\nÜrün güvenliği denetim grupları");
    const dl = await download("TR_UGD_GROUPS", SOURCE_CATALOGUE.TR_UGD_GROUPS.url);
    if (dl && !dry) report(await ingestUgdGroups({ bytes: dl.bytes, html: Buffer.from(dl.bytes).toString("utf8") }));
  }
  if (wanted("TR_IMPORT_COMMUNIQUES")) {
    console.log("\nİthalat tebliğleri");
    const dl = await download("TR_IMPORT_COMMUNIQUES", SOURCE_CATALOGUE.TR_IMPORT_COMMUNIQUES.url);
    if (dl && !dry) report(await ingestCommuniques({ bytes: dl.bytes, html: Buffer.from(dl.bytes).toString("utf8") }));
  }

  // 7. VAT rate — only ingested if the rate can actually be READ from the file.
  if (wanted("TR_VAT_RATES")) {
    console.log("\nKDV oranları (GİB)");
    const dl = await download("TR_VAT_RATES", SOURCE_CATALOGUE.TR_VAT_RATES.url);
    if (dl) {
      // The PDF sets text glyph-group by glyph-group ("M A DD E 1"), so the
      // pattern is matched on the whitespace-stripped text and anchored to the
      // article reference — the rate is only accepted as Article 1/1-(a)'s own.
      const compact = pdfText(dl.bytes).replace(/\s+/g, "");
      const pct = compact.match(/MADDE1\(1\)a\)%(\d{1,2})/);
      if (!pct) {
        console.log("  ! PDF'den Madde 1/1-a genel oranı okunamadı — KDV kuralı OLUŞTURULMADI (oran uydurulmaz).");
      } else if (!dry) {
        report(await ingestVatRates({
          bytes: dl.bytes,
          extracted: {
            generalPct: Number(pct[1]),
            note: `PDF'in Madde 1/1-a metninden okundu ("% ${pct[1]}"). Yürürlük tarihi (10/7/2023, CK 7346) PDF metninden okunamadı; kural NEEDS_REVIEW olarak işaretli. İndirimli oran (I) ve (II) sayılı listeler GTİP bazında işlenmedi.`,
          },
        }));
      }
    }
  }

  if (wanted("TR_TARA") && !dry) {
    console.log("\nTARA (elle doğrulama bağlantısı)");
    report(await recordTara());
  }

  console.log("\n--- ÖZET ---");
  for (const s of summaries) console.log(`${s.key.padEnd(24)} ${s.isNew ? "yeni" : "aynı"} ${JSON.stringify(s.counts)} uyarı=${s.warnings.length}`);
  await db.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await db.$disconnect();
  process.exit(1);
});

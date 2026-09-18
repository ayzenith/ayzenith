import { test } from "node:test";
import assert from "node:assert/strict";
import { Prisma } from "@prisma/client";
import {
  addDays, asDateRule, asRateType, crossRate, daysBetween, docDay, isWeekend, istanbulDay,
  parseTcmbXml, pickBulletinDay, tcmbUrl, tryPerUnit,
} from "../src/server/os/fx-tcmb";

// Trimmed from the real bulletin of 18.09.2026 (https://www.tcmb.gov.tr/kurlar/today.xml).
const XML = `<?xml version="1.0" encoding="UTF-8"?>
<?xml-stylesheet type="text/xsl" href="isokur.xsl"?>
<Tarih_Date Tarih="18.09.2026" Date="09/18/2026"  Bulten_No="2026/176" >
	<Currency CrossOrder="0" Kod="USD" CurrencyCode="USD">
			<Unit>1</Unit>
			<Isim>ABD DOLARI</Isim>
			<CurrencyName>US DOLLAR</CurrencyName>
			<ForexBuying>48.6116</ForexBuying>
			<ForexSelling>48.6992</ForexSelling>
			<BanknoteBuying>48.5776</BanknoteBuying>
			<BanknoteSelling>48.7723</BanknoteSelling>
			<CrossRateUSD/>
			<CrossRateOther/>
	</Currency>
	<Currency CrossOrder="1" Kod="EUR" CurrencyCode="EUR">
			<Unit>1</Unit>
			<ForexBuying>55.7981</ForexBuying>
			<ForexSelling>55.8986</ForexSelling>
			<BanknoteBuying>55.7590</BanknoteBuying>
			<BanknoteSelling>55.9824</BanknoteSelling>
	</Currency>
	<Currency CrossOrder="5" Kod="JPY" CurrencyCode="JPY">
			<Unit>100</Unit>
			<ForexBuying>30.7666</ForexBuying>
			<ForexSelling>30.9704</ForexSelling>
			<BanknoteBuying>30.6528</BanknoteBuying>
			<BanknoteSelling>31.0881</BanknoteSelling>
	</Currency>
	<Currency CrossOrder="14" Kod="RUB" CurrencyCode="RUB">
			<Unit>1</Unit>
			<ForexBuying>0.57344</ForexBuying>
			<ForexSelling>0.58094</ForexSelling>
			<BanknoteBuying></BanknoteBuying>
			<BanknoteSelling></BanknoteSelling>
	</Currency>
	<Currency CrossOrder="99" Kod="XDR" CurrencyCode="XDR">
			<Unit>1</Unit>
			<ForexBuying></ForexBuying>
			<ForexSelling></ForexSelling>
			<BanknoteBuying></BanknoteBuying>
			<BanknoteSelling></BanknoteSelling>
	</Currency>
</Tarih_Date>`;

const line = (cur: string) => parseTcmbXml(XML)!.lines.find((l) => l.currency === cur)!;

test("parses the bulletin day, number and currency lines", () => {
  const b = parseTcmbXml(XML);
  assert.ok(b);
  assert.equal(b.day, "2026-09-18");
  assert.equal(b.bulletinNo, "2026/176");
  assert.deepEqual(b.lines.map((l) => l.currency), ["USD", "EUR", "JPY", "RUB"]);
  assert.equal(line("USD").forexBuying, "48.6116");
});

test("a line with no tradable column (XDR) is dropped, a blank banknote column is null", () => {
  assert.equal(parseTcmbXml(XML)!.lines.some((l) => l.currency === "XDR"), false);
  assert.equal(line("RUB").banknoteBuying, null);
});

test("the HTML 404 page for a weekend is not mistaken for a bulletin", () => {
  assert.equal(parseTcmbXml("<html><head><title>Sayfa Goruntulenemedi - Page Not Found</title></head></html>"), null);
  assert.equal(parseTcmbXml(""), null);
});

test("JPY is quoted per 100 units and is divided down to 1 unit", () => {
  const r = tryPerUnit(line("JPY"), "FOREX_BUYING");
  assert.ok(r);
  assert.equal(r.value.toString(), "0.307666");
});

test("a blank banknote column falls back to forex on the SAME side, never the other side", () => {
  const buy = tryPerUnit(line("RUB"), "BANKNOTE_BUYING");
  assert.equal(buy?.used, "FOREX_BUYING");
  assert.equal(buy?.value.toString(), "0.57344");
  const sell = tryPerUnit(line("RUB"), "BANKNOTE_SELLING");
  assert.equal(sell?.used, "FOREX_SELLING");
});

test("cross rate for a non-TRY base uses both quotes of the same bulletin", () => {
  const eur = tryPerUnit(line("EUR"), "FOREX_BUYING")!.value;
  const usd = tryPerUnit(line("USD"), "FOREX_BUYING")!.value;
  // 1 EUR in USD = 55.7981 / 48.6116
  assert.equal(crossRate(eur, usd).toString(), new Prisma.Decimal("55.7981").div("48.6116").toDecimalPlaces(8).toString());
  // base TRY: the rate is the TRY quote itself
  assert.equal(crossRate(eur, new Prisma.Decimal(1)).toString(), "55.7981");
});

test("PREVIOUS rule: a document on Monday uses Friday's bulletin; SAME_DAY uses Monday's", () => {
  const published = ["2026-09-17", "2026-09-18", "2026-09-21"]; // Thu, Fri, Mon
  assert.equal(pickBulletinDay(published, "2026-09-21", "PREVIOUS_BULLETIN"), "2026-09-18");
  assert.equal(pickBulletinDay(published, "2026-09-21", "SAME_DAY_BULLETIN"), "2026-09-21");
  // Sunday document: the last business day before it under both rules
  assert.equal(pickBulletinDay(published, "2026-09-20", "PREVIOUS_BULLETIN"), "2026-09-18");
  assert.equal(pickBulletinDay(published, "2026-09-20", "SAME_DAY_BULLETIN"), "2026-09-18");
  // Nothing old enough
  assert.equal(pickBulletinDay(published, "2026-09-17", "PREVIOUS_BULLETIN"), null);
});

test("archive URL follows TCMB's own layout", () => {
  assert.equal(tcmbUrl("2026-09-15"), "https://www.tcmb.gov.tr/kurlar/202609/15092026.xml");
});

test("calendar helpers", () => {
  assert.equal(addDays("2026-03-01", -1), "2026-02-28");
  assert.equal(daysBetween("2026-09-18", "2026-09-21"), 3);
  assert.equal(isWeekend("2026-09-19"), true); // Saturday
  assert.equal(isWeekend("2026-09-18"), false);
  // A form date is taken as the picked day, not shifted by time zones.
  assert.equal(docDay("2026-09-18"), "2026-09-18");
  assert.equal(docDay(new Date("2026-09-18T00:00:00Z")), "2026-09-18");
  // 22:30 UTC is already the next day in Istanbul (UTC+3).
  assert.equal(istanbulDay(new Date("2026-09-18T22:30:00Z")), "2026-09-19");
});

test("unknown setting values fall back to the safe defaults", () => {
  assert.equal(asRateType("nonsense"), "FOREX_BUYING");
  assert.equal(asRateType("BANKNOTE_SELLING"), "BANKNOTE_SELLING");
  assert.equal(asDateRule(null), "PREVIOUS_BULLETIN");
});

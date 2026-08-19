# AYZENITH BUSINESS OS — DEVİR BRİEFİNGİ

Bu belge, yarım kalan Business OS modülünü **devralacak geliştirici (veya AI)** içindir.
Veri modeli ve tüm sunucu katmanı bitti ve canlı veritabanına uygulandı. Kalan iş: **11 arayüz ekranı**.

---

## 0. İLK YAPILACAK

```bash
npm run typecheck
```

Arayüz dosyaları yazılmaya başlandıktan sonra typecheck çalıştırılmadı. Önce bunu çalıştır, çıkan hataları düzelt, sonra yeni ekran yazmaya başla.

---

## 1. PROJE

- **Next.js 15 App Router**, React 19, TypeScript strict (`noUncheckedIndexedAccess` AÇIK)
- **Prisma 6** + Supabase Postgres (pooler `?pgbouncer=true`, migration'lar `DIRECT_URL` ile)
- **Tailwind v4**, CSS-first token sistemi (`src/app/globals.css`)
- Vercel, `arn1` (Stockholm) bölgesi

Üç ayrı uygulama yüzeyi, üç ayrı root layout:

```
src/app/
  [locale]/(marketing)/   → tanıtım sitesi        [STATİK — dokunma]
  (admin)/admin/…         → CMS + RADAR + Lead Finder  [dokunma]
  (business)/os/…         → BUSINESS OS           [çalışma alanın]
```

---

## 2. ASLA BOZULMAYACAK KURALLAR

Bunlar mimari kararlardır, tercih değil. İhlal edilirse sistem sessizce yanlış rakam üretir.

1. **Para `Decimal`'dir, asla `Float` değil.** Her parasal satır kendi `currency` + `fxRate` + `fxRateDate` alanlarını taşır. `fxRate` tanımı: *1 birim belge para biriminin ANA para birimindeki karşılığı, o günkü kurla.* Geçmişe dönük tek bir global kur uygulanmaz — belge kendi kurunu saklar.
2. **Stok bir sayı değil, defterdir.** Hiçbir yerde `quantity` sütunu yok. Eldeki miktar = `SUM(StockMovement.quantity)` (pozitif giriş, negatif çıkış). Transfer = `transferGroup` paylaşan İKİ satır.
3. **Kâr elle yazılmaz.** Satış onaylanırken tüketilen stoğun ağırlıklı ortalama landed cost'undan hesaplanır.
4. **Gerçek maliyet türetilir.** Nakliye/gümrük/komisyon `CostLine` olarak girilir, `allocateCosts()` bunları satırlara dağıtır. Kullanıcı ikinci bir "gerçek maliyet" sayısı yazmaz.
5. **Vergi KAYDEDİLİR, HESAPLANMAZ.** `TaxRecord` bir ajanda kaydıdır. Mevzuat uygulanmaz, "şu kadar ödemelisin" denmez.
6. **Lead Finder'a ve RADAR'a YAZILMAZ.** `Party.leadCompanyId` düz bir `String?`'tir — foreign key DEĞİL. Lead Finder'dan veri **kopyalanır**, referansla bağlanmaz. `src/server/leads/*` ve `src/server/radar/*` içine tek satır yazma.
7. **"Gecikmiş" saklanmaz**, okuma anında hesaplanır: `dueDate < today AND status <> PAID`.
8. **Finansal geçmiş silinmez.** Onaylı belge iptal edilir (ters hareket + `CANCELLED`), silinmez. Ticari kaydı olan firma/ürün pasife alınır.
9. **Her toplam SQL'de hesaplanır.** Tabloyu belleğe alıp JS'te toplama. Her liste sayfalanır.
10. **Her server action `requireUser()` ile başlar.**

---

## 3. VERİTABANI — HAZIR

`prisma/schema.prisma` içinde, dosyanın sonundaki `AYZENITH BUSINESS OS — V1` bloğu. Migration `20260816215956_business_os_v1` **canlıya uygulandı**. Tamamen additive: 20 `CREATE TABLE`, mevcut hiçbir tabloya `ALTER`/`DROP` yok.

Modeller: `Party`, `PartyRelation`, `PartyContact`, `Item`, `Channel`, `ItemChannelPrice`, `StockLocation`, `StockMovement`, `Purchase`, `PurchaseLine`, `Sale`, `SaleLine`, `CostLine`, `Payment`, `Expense`, `RecurringExpense`, `TaxRecord`, `OsSetting`, `OsSequence`, `OsImportBatch`

Enum'lar: `PartyRoleType`, `TradeModel`, `RelationStatus`, `ChannelType`, `StockLocationType`, `StockMoveReason`, `DocStatus`, `PaymentDirection`, `PaymentStatus`, `PaymentMethod`, `CostKind`, `CostAllocation`, `ExpenseKind`, `RecurrenceFreq`, `TaxStatus`

**Yeni model ekleme.** İhtiyacın olan her şey var.

---

## 4. SUNUCU KATMANI — HAZIR

Hepsi `src/server/os/` altında, `import "server-only"` ile. **Bunları değiştirme, sadece çağır.**

| Dosya | Dışa açtıkları |
|---|---|
| `money.ts` | `D`, `ZERO`, `toNum`, `toNumOrNull`, `parseDecimal`, `parseOptionalDecimal`, `parseIntOrNull`, `toBase`, `money`, `qty`, `unitCost`, `lineTotal`, `sum`, `ratio`, `marginPct`, `type Dec` |
| `settings.ts` | `getOsSettings`, `saveOsSettings`, `suggestFxRate`, `type OsSettings` |
| `sequence.ts` | `nextCode(tx, prefix, year)` |
| `inventory.ts` | `postMovements`, `averageCost`, `listStock`, `stockByLocation`, `stockSummary`, `listMovements`, `transferStock`, `adjustStock`, `listLocations`, `ensureDefaultLocation`, `StockError` |
| `parties.ts` | `listParties`, `partyStats`, `getParty`, `partyDocuments`, `partyItems`, `createParty`, `updateParty`, `upsertRelation`, `removeRelation`, `upsertContact`, `removeContact`, `archiveParty`, `deletePartyIfUnused`, `searchParties` |
| `items.ts` | `listItems`, `itemStats`, `getItem`, `itemDocuments`, `createItem`, `updateItem`, `setChannelPrice`, `priceFor`, `deleteItemIfUnused`, `listCategories`, `searchItems` |
| `channels.ts` | `listChannels`, `channelPerformance`, `getChannel`, `upsertChannel`, `deleteChannelIfUnused`, `ensureChannelLocation`, `upsertLocation`, `deleteLocationIfEmpty`, `seedStarterChannels` |
| `documents.ts` | `allocateCosts`, `landedUnitCostOf`, `dueDateFor`, `commissionAmount` |
| `purchases.ts` | `createPurchase`, `confirmPurchase`, `cancelPurchase`, `deletePurchase`, `listPurchases`, `getPurchase`, `DocumentError`, `type PurchaseInput/PurchaseLineInput/CostLineInput` |
| `sales.ts` | `createSale`, `confirmSale`, `cancelSale`, `deleteSale`, `listSales`, `getSale`, `type SaleInput/SaleLineInput` |
| `finance.ts` | `getCashflow`, `listPayments`, `settlePayment`, `createPayment`, `cancelPayment`, `listExpenses`, `createExpense`, `deleteExpense`, `listRecurring`, `upsertRecurring`, `deleteRecurring`, `materialiseRecurring`, `listTaxRecords`, `upsertTaxRecord`, `markTaxPaid`, `deleteTaxRecord`, `startOfDay`, `addDays` |
| `dashboard.ts` | `getOsDashboard` |
| `reports.ts` | `salesReport`, `purchaseReport`, `profitByItem`, `customerReport`, `supplierReport`, `channelReport`, `cashflowReport`, `stockReport`, `reportCountries`, `type ReportFilter` |
| `leadbridge.ts` | `findPartyForLead`, `findPartiesForLeads`, `transferLeadToParty`, `transferLeads`, `leadOriginFor` |
| `excel/workbook.ts` | `createWorkbook`, `addSheet`, `addSummarySheet`, `toBuffer`, `fileName` |
| `excel/schemas.ts` | `IMPORT_SCHEMAS`, `schemaFor`, `autoMap`, `normalizeHeader` — 6 tür: `party`, `item`, `expense`, `stock`, `purchase`, `sale` |
| `excel/import.ts` | `previewImport`, `runImport`, `buildTemplate`, `buildErrorReport` |
| `excel/export.ts` | `exportParties`, `exportItems`, `exportStock`, `exportMovements`, `exportChannels`, `exportPurchases`, `exportSales`, `exportPayments`, `exportExpenses`, `exportTax`, `exportReport` |

> **Not:** `Decimal` client'a serialize edilemez. Sunucu fonksiyonları zaten `number` döndürüyor. Yeni bir sorgu yazarsan `toNum()` ile dönüştür.

---

## 5. ARAYÜZ ALTYAPISI — HAZIR

`src/components/os/`:

- **`ui.tsx`** (Server Component'ler): `PageHead`, `Card`, `StatCard`, `EmptyState`, `Table`/`Th`/`Td`/`Tr`, `Money`, `Qty`, `Pct`, `DateText`, `Badge`, `StatusBadge`, `Pagination`, `FilterBar`, `Tabs`, `Field`, `Detail`, `Note`, `btn` (`.primary/.secondary/.ghost/.danger`), `input`
- **`nav.ts`** — kenar çubuğu menüsü + `quickActions`
- **`os-shell.tsx`** — kabuk (client, sadece mobil drawer state'i)
- **`party-form.tsx`**, **`item-form.tsx`** — form örnekleri, aynı deseni takip et
- **`excel-tools.tsx`** — her listeye konan Excel butonları (client)

`src/config/os.ts`: tüm Türkçe etiket sözlükleri (`PARTY_ROLE_LABELS`, `DOC_STATUS_LABELS`, `CHANNEL_TYPE_LABELS`, `STOCK_REASON_LABELS`, `PAYMENT_STATUS_LABELS`, `EXPENSE_KIND_LABELS`, `TAX_STATUS_LABELS`, `TRADE_MODEL_LABELS`, `COST_KIND_LABELS` …), `CURRENCIES`, `CASHFLOW_BUCKETS`, `UNITS`, `formatMoney`, `formatQty`, `formatPercent`, `formatDate`

---

## 6. HAZIR EKRANLAR (örnek al)

```
src/app/(business)/
  layout.tsx                          root layout
  os/layout.tsx                       requireUser() + OsShell
  os/loading.tsx                      skeleton
  os/page.tsx                         KOKPİT
  os/export/route.ts                  tüm Excel indirmeleri (?kind=…)
  os/template/route.ts                şablon (?entity=…) + hata raporu (?errors=batchId)
  os/import-actions.ts                previewImportAction, runImportAction
  os/companies/{actions.ts,page.tsx,new/page.tsx,[id]/page.tsx,[id]/edit/page.tsx}
  os/products/{actions.ts,page.tsx,new/page.tsx,[id]/edit/page.tsx}
```

**En iyi örnekler:** liste için `os/companies/page.tsx`, sekmeli detay için `os/companies/[id]/page.tsx`, server action deseni için `os/companies/actions.ts`.

---

## 7. YAPILACAKLAR

Her sayfa: `export const dynamic = "force-dynamic";` + `export const metadata`. Server Component ol, gereksiz `"use client"` koyma. `searchParams` ve `params` Next 15'te **Promise** — `await` et.

### 7.1 `os/products/[id]/page.tsx` — Ürün detayı
`getItem(id)`, `itemDocuments(id)`, `stockByLocation(id)`, `listChannels({activeOnly:true})`, `getOsSettings()`
Sekmeler: **Genel · Stok · Alışlar · Satışlar · Kanallar · Kârlılık**
- Genel: bilgiler + `StatCard`'lar (eldeki stok, gerçek maliyet, satış fiyatı, marj)
- Stok: `stockByLocation` tablosu + `listMovements({itemId})`
- Kanallar: her kanal için fiyat girişi → `setChannelPriceAction` (zaten `products/actions.ts` içinde var)
- Kârlılık: `itemDocuments().sales` üzerinden satır kârları
- `avgCost === null` ise **"ölçülmedi"** yaz, `0` yazma.

### 7.2 `os/sales/` — Satışlar
`page.tsx` (liste), `new/page.tsx`, `[id]/page.tsx`, `actions.ts`
- Liste: `listSales({search,customerId,channelId,status,from,to,page})`. Sütunlar: belge, tarih, müşteri, kanal, tutar, **kâr**, **marj**, durum. `ExcelTools entity="sale"`, export `?kind=sales`.
- **Yeni satış formu = client component** (`src/components/os/sale-form.tsx`). Dinamik satır ekleme/silme `useState` ile. Alanlar: müşteri (`searchParties`), kanal, konum, tarih, vade, para birimi, kur (`suggestFxRate` ile ön dolu), **ticari model** (`DROPSHIP` seçilirse konum alanı gizlenir — stoksuz satış), satır listesi (ürün / miktar / birim fiyat / iskonto / KDV), ek maliyet satırları, durum (Taslak/Onaylı).
  Ürün seçilince fiyatı `priceFor(itemId, channelId)` ile ön doldur.
- Action `createSale(input, userId)` çağırır. `input.lines[].quantity/unitPrice` **`Dec`** olmalı → `parseDecimal()` kullan.
- Detay: `getSale(id)`. Satır tablosu + **birim maliyet, satır kârı** sütunları, ek maliyetler, ödeme planı, `Onayla` / `İptal et` / `Sil` butonları (`confirmSale`/`cancelSale`/`deleteSale`).
- `StockError` ve `DocumentError` mesajlarını kullanıcıya **aynen göster** — Türkçe ve açıklayıcı yazıldılar.

### 7.3 `os/purchases/` — Alışlar
Satışların aynısı, `listPurchases`/`getPurchase`/`createPurchase`/`confirmPurchase`/`cancelPurchase`/`deletePurchase` ile.
- Farkı: **ek maliyet satırları burada kritik** (nakliye, gümrük, ambalaj). Her birinin kendi para birimi + kuru + dağıtım yöntemi (`BY_VALUE`/`BY_QUANTITY`/`NONE`) var.
- Detayda her satırın **`landedUnitCost`** (gerçek birim maliyet) değerini göster ve "alış fiyatı + dağıtılan giderler" olarak açıkla.

### 7.4 `os/inventory/` — Stok
`page.tsx` + `actions.ts` (+ `locations/page.tsx`)
- `listStock({search, locationId, lowOnly, page})`, `listLocations()`, `stockSummary()`
- `?low=1` filtresi kokpitten linkleniyor — çalışmalı.
- Satır açılınca `stockByLocation(itemId)` dağılımı.
- İşlemler: **Transfer** (`transferStock`), **Düzeltme/Açılış/Fire** (`adjustStock`).
- `listMovements()` hareket geçmişi sekmesi. Export `?kind=stock` ve `?kind=movements`.
- `ExcelTools entity="stock"` (açılış stoğu içe aktarma).
- Konumlar ekranı: `upsertLocation`, `deleteLocationIfEmpty`, `ensureChannelLocation`.

### 7.5 `os/channels/` — Satış kanalları
`listChannels()` + performans sütunları (ciro, komisyon gideri, kâr). `upsertChannel`, `deleteChannelIfUnused`. Boşsa `seedStarterChannels()` çağıran "Başlangıç kanallarını oluştur" butonu (Trendyol, Amazon, Web, Mağaza, B2B, Manuel).

### 7.6 `os/finance/page.tsx` — Finans kokpiti
- Sayfa yüklenirken `materialiseRecurring(12)` çağır (idempotent — iki kez çalışması sorun değil).
- `getCashflow(baseCurrency)` → **Gecikmiş / 30 gün / 1–6 ay / 6–12 ay / 12+ ay** matrisi, iki yön (girecek/çıkacak) ve net.
- `cashflowReport()` ile aylık tablo.
- Gecikmiş tahsilat/ödeme kısayolları en üstte.

### 7.7 `os/payments/` — Tahsilat & Ödeme
`listPayments({direction,status,partyId,overdueOnly,from,to,page})`
- `?direction=IN` tahsilat, `?direction=OUT` ödeme, `?overdue=1` gecikmişler, `?new=IN|OUT` yeni kayıt formu açar (kokpit ve menü bu URL'leri veriyor).
- Satır işlemi: **Tahsil et / Öde** → `settlePayment({id, amount, paidAt, method, reference})`. Kısmi ödeme destekli.
- `createPayment` ile belgesiz alacak/borç, `cancelPayment` ile iptal.
- Gecikmiş satırlar kırmızı; `overdue` alanı zaten hesaplanmış geliyor.

### 7.8 `os/expenses/` — Giderler
`listExpenses`, `createExpense`, `deleteExpense` + **Tekrarlayan giderler** bölümü: `listRecurring`, `upsertRecurring`, `deleteRecurring`. `?new=1` formu açar. `ExcelTools entity="expense"`.

### 7.9 `os/tax/` — Vergi takvimi
`listTaxRecords`, `upsertTaxRecord`, `markTaxPaid`, `deleteTaxRecord`. Tür alanı `TAX_KIND_SUGGESTIONS` ile datalist.
**Ekranda net bir not olsun:** *"Vergi hesaplanmaz. Buraya muhasebecinden gelen tutarları kaydedersin; sistem sadece vadesini hatırlatır ve nakit akışına yansıtır."*

### 7.10 `os/reports/page.tsx` — Raporlar
Tek sayfa, `?kind=` ile 8 rapor: `sales`, `purchases`, `profit`, `customers`, `suppliers`, `channels`, `cashflow`, `stock`.
Filtreler: tarih aralığı, firma, ürün, kanal, ülke (`reportCountries()`), para birimi.
Her rapor "Excel'e aktar" → `/os/export?kind=report&report=<kind>&from=…&to=…`

### 7.11 `os/settings/page.tsx` — Ayarlar
`getOsSettings`/`saveOsSettings`: ana para birimi, varsayılan ülke, **eksi stoğa izin ver** anahtarı, **kur tablosu** (EUR/USD/GBP… manuel giriş, `fxRates` JSON).
Uyarı metni: *"Kur değişikliği sadece YENİ belgelerde kullanılır. Kaydedilmiş belgeler kendi kurunu korur."*
Ayrıca `seedStarterChannels()` butonu.

---

## 8. LEAD FINDER KÖPRÜSÜ (opsiyonel, son yapılacak)

`src/app/(admin)/admin/(dashboard)/lead-finder/company/[id]/page.tsx` içine **"Business OS'a Aktar"** butonu.
`transferLeadAction` zaten `os/companies/actions.ts` içinde hazır; `leadCompanyId` + `role` gönderir.
`findPartyForLead(leadCompanyId)` ile zaten aktarılmışsa buton yerine "Business OS'ta görüntüle" linki göster.

> Bu tek dokunuş dışında Lead Finder'da hiçbir şey değiştirme.

---

## 9. BİTİRME KONTROLÜ

```bash
npm run typecheck
npx next lint
npm run build
```

Regresyon kontrolü — bunlar çalışmaya devam etmeli:
`/` (tanıtım sitesi, **statik** kalmalı), `/admin` (CMS), `/admin/radar`, `/admin/lead-finder`, giriş/çıkış.

Uçtan uca senaryo:
1. Tedarikçi oluştur → 2. Ürün oluştur → 3. 50 adet alış (nakliye + gümrük ek maliyetiyle) → 4. Alışı onayla, `landedUnitCost` hesaplandı mı → 5. Stok Ana Depo'da 50 mi → 6. 10 Trendyol / 10 Amazon / 10 Web / 5 Mağaza transferi → 7. Depoda 15 kaldı mı → 8. Trendyol'dan 3 adet satış → 9. Stok düştü mü, kâr komisyon düşülerek hesaplandı mı → 10. Vadeli tahsilat finans takviminde doğru kovada mı → 11. Excel dışa aktar → 12. Excel içe aktar (hatalı satır raporu dahil).

---

## 10. TON

Arayüz metinleri **Türkçe**, sade, samimi ama profesyonel. Kullanıcı teknik değil.
- Ölçülmemiş bir değer için `0` yazma → **"ölçülmedi"**.
- Hata mesajı ne olduğunu **ve ne yapılacağını** söylesin.
- Boş ekran, kullanıcıya bir sonraki adımı göstersin.

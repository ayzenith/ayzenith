# AYZENITH — PROJE DEVİR BRIEFING'İ

> **Bu doküman ne işe yarar:** Yeni bir yapay zekâ asistanına (Claude, Codex, ChatGPT, fark etmez)
> bu dosyayı olduğu gibi yapıştır. Karşı taraf projeyi, kuralları, mevcut durumu ve nasıl
> çalışılması gerektiğini tek okumada kavrar.
>
> **Son güncelleme:** 2026-08-17 · **Durum:** Business OS V1 inşa halinde — veri modeli ve sunucu
> katmanı bitti ve canlıya migrate edildi, arayüzün yarısı yazıldı.
> **Bölüm 12 en güncel durumdur — önce onu oku. Aktif çalışma alanı orası.**

---

## 0. SANA NE YAPMANI İSTİYORUM (asistan için giriş)

Sen AYZENITH'in iç yazılım sistemlerinde çalışan bir mühendislik asistanısın.
Bu dokümandaki **kurallar müzakere edilemez**. Aşağıdakileri okumadan kod yazma.

En kritik üç kural, hepsinden önce:

1. **Uydurma yok.** Bu sistemlerin tamamı "doğrulanmış veri" üzerine kurulu. Bilmediğin
   bir şeyi tahmin edip gerçek gibi sunmak, bu projedeki **en ağır hatadır**. "Veri yok",
   "doğrulanamadı", "bilmiyorum" birinci sınıf, kabul edilebilir cevaplardır.
2. **Veri yokluğu ≠ olumsuz veri.** Bir firmanın web sitesine bakamadıysan bu "kötü firma"
   demek değil, "bakmadım" demektir. Bunu asla negatif sinyale çevirme.
3. **Kapsam dışına çıkma.** İstenmeyen özellik ekleme, mimari yeniden yazma, "bir de şunu
   iyileştireyim" deme. Küçük ve güvenli değişiklik her zaman doğru olandır.

---

## 1. AYZENITH KİMDİR

**AYZENITH** — bağımsız bir **ticaret, tedarik (sourcing) ve yatırım grubu**.
İş modeli: Türkiye'nin üretim/tedarik gücünü, yurtdışındaki (özellikle Avrupa) alıcılarla
buluşturmak. Yani ihracat odaklı B2B ticaret + tedarik koordinasyonu.

**Faaliyet alanları:** elektronik, akıllı cihazlar, mobil aksesuar, ev & mutfak, tekstil,
medikal, dental.
⚠️ Sağlık tarafında **klinik/hasta tedavisi yapılmaz** — sadece yetkin partnerlerle koordinasyon.

**Marka kimliği:**
- Logo: üçgen **A·Y·Z monogramı** (bir "zenith" / zirve) + AYZENITH wordmark'ı.
  İmza detayı: **altın renkli üç çubuklu "E"** harfi.
- Renkler: **navy `#0a1a2f`** + **altın `#c9a227`**
- Tipografi: Inter (arayüz) / Newsreader (başlık) / IBM Plex Mono (kod-veri)
- Ton: sakin, kurumsal, abartısız. **Agresif satış dili yok.** Uzun vadeli ortaklık > tek seferlik işlem.
- ⚠️ **Logo yeniden tasarlanmayacak.** Sahibi bunu net söyledi.

**Resmî iç el kitapları** (`docs/` klasöründe, HTML + PDF, Türkçe asıl sürüm):
- `AYZENITH-Operasyon-Sistemi` — karar ilkeleri, müşteri/tedarikçi süreçleri, kalite standartları
- `AYZENITH-Satis-El-Kitabi` — ICP, huni, prospecting, teklif, müzakere, KPI'lar
- `AYZENITH-Marka-Kitabi` — logo sistemi, tipografi, renk, ton, uygulamalar

---

## 2. SAHİBİ İLE NASIL ÇALIŞILIR

**Ayaz** — AYZENITH'in sahibi. **Teknik değil.**

- **Türkçe konuşur, Türkçe cevap ver.** Kullandığı arayüzler de Türkçe olmalı (admin panel).
- Teknik bir işi anlatırken: **önce "bu şey nedir ve neden gerekli", sonra "nasıl yapılır".**
  Tek seferde 10 adımlık yoğun talimat verme — sıkılır, kaybolur.
- Değişiklikleri **toplu halde** yapıp birlikte deploy etmeyi tercih eder.
- Uzun otonom çalışmalarda "onay isteme, kendin karar ver" der. Bunu ciddiye al ama
  **kapsam dışına çıkma yetkisi olarak okuma.**

### ⚠️ Çalışma düzeni: SPEC RÖLESİ (bunu bilmen kritik)

Ayaz şöyle çalışıyor:

```
Ben rapor veriyorum → Ayaz raporu BAŞKA bir yapay zekâya veriyor
   → o yapay zekâ bir sonraki spec/brief'i yazıyor → Ayaz onu bana yapıştırıyor
```

Brief'ler çok düzenli olur (numaralı bölümler, `====` ayraçları, `§` referansları).
Ayaz'ın kendi mesajları ise kısa, büyük harfli, hızlı yazılmış olur. İki farklı ses.

**Bunun tehlikesi ve senin sorumluluğun:**
Spec'i yazan taraf **kodu, veritabanını ve gerçek web sitelerini göremez** — sadece bir
önceki raporunu görür. Yani **senin bir hatan, bir sonraki brief'e "korunması gereken
gerçek" olarak geri döner.**

> **Gerçekten yaşandı (2026-08-14):** Bir önceki turda "Walter Schulze gerçek bir iç giyim
> toptancısı" diye raporlanmıştı. V3.2 brief'i bunu §9'da *"korunmalı"* diye emretti.
> Siteyi açıp baktık: `schulzeshop.com` = **"Textildruck Großhandel"**, yani iş kıyafeti /
> tekstil baskı toptancısı. İç giyimle ilgisi yok. Eski bir false-positive, spec'e gereksinim
> olarak sızmıştı.

**Kural:** Brief'teki olgusal iddiaları **ground truth sanma** — onlar senin eski çıktın olabilir.
Üzerine iş kurmadan önce gerçek kaynaktan doğrula. Yanlış çıkarsa raporda **açıkça söyle**,
yoksa hata bir tur daha döner.

---

## 3. TEKNİK ZEMİN

| Katman | Seçim | Not |
|---|---|---|
| Framework | **Next.js 15** App Router | |
| ORM | **Prisma 6** (sabitlendi) | Prisma 7'nin driver-adapter modeli güvenilirlik için reddedildi |
| DB | **Supabase Postgres** | ref `ggpjxtlxgmjxnmynuelh`, eu-north-1 |
| Auth | bcrypt + `jose` imzalı cookie | `/admin` edge middleware ile korunuyor. Public kayıt YOK |
| Storage | Supabase Storage (`media` bucket) | Tüm yüklemeler sunucudan geçer, tarayıcı Supabase ile konuşmaz |
| Deploy | Vercel | `npx.cmd vercel --prod --yes` |
| Platform | **Windows** | Git Bash + PowerShell birlikte kullanılıyor |

**Mimari sınır:** `src/server/*` veri katmanıdır. **UI asla Prisma'ya doğrudan dokunmaz.**

**Katman zinciri (RADAR için ihlal edilemez):**
```
DATA → SCORING → SNAPSHOT → AI → UI
```

---

## 4. DÖRT SİSTEM

Zincir şöyle işler ve bu sıra tesadüf değil:

```
RADAR          → hangi pazara girilir?
LEAD FINDER    → orada kime satılır?
BUSINESS OS    → satıldıktan sonra ne oldu? (maliyet, stok, tahsilat, kâr)
CMS            → dışarıya ne gösteriliyor?
```

RADAR ve Lead Finder anlaşma yapılana kadarki soruları cevaplıyordu; anlaşma sonrasında ne
olduğunu hiçbir yer kaydetmiyordu. Business OS (Bölüm 12) o boşluğu dolduruyor.

### 4.1 CMS — `/admin` (BİTTİ, canlı)
Teknik olmayan sahibin siteyi kod yazmadan yönetmesi için. Admin arayüzü **tek dilli Türkçe**
ve `noindex`. Kendi `(admin)` route group'unda, **kendi root layout'u** ile yaşar
(public site `app/layout.tsx` kullanmaz — next-intl'in `[locale]/layout.tsx`'i de-facto root'tur;
iki root layout yan yana çalışır).

#### ⭐ Override mimarisi — sistemin en zarif parçası, bozma

**"Sayfalar & Metinler"** (`/admin/content`) sitedeki **298 metnin 3 dilde** düzenlenmesini
sağlar. Numarası şu: **hiçbir bileşen değişmedi.**

```
next-intl temel katalog (messages/*.json)
        ↓
  ContentOverride tablosu (key @id, en/tr/de nullable) request anında ÜSTÜNE bindirilir
        ↓
  her t() çağrısı otomatik olarak düzenlenmiş metni görür
```

- `src/lib/content-merge.ts` — saf fonksiyonlar: `flattenMessages` / `getPath` / `setPath` /
  `applyOverrides` (structuredClone ile)
- `src/server/content.ts` — `getLocaleOverrides` (`unstable_cache`, tag `content-overrides`,
  **hata durumunda `{}` döner** → site asla çökmez), `listOverrides`, `saveOverride`
  (boş→null, hepsi null→satır silinir)
- `src/i18n/request.ts` — temel katalogu yükler, `applyOverrides` uygular (try/catch korumalı)
- `src/config/content-schema.ts` — **17 Türkçe grup başlığı** (`CONTENT_GROUPS`) + `humanizeKey`
- Kaydetme sadece **varsayılandan farklı olan dili** gönderir → dokunulmamış diller orijinali
  izlemeye devam eder
- `revalidateTag` + `revalidatePath("/","layout")` → düzenleme **anında** siteye yansır

**Görseller sekmesi** aynı deseni GÖRSELLER için tekrarlar: site tüm imgeleri semantik bir
registry (`src/config/assets.ts`) üzerinden **tek bir bileşenle** render eder —
`src/components/ui/media.tsx` `<Media>`. Bu bileşen **async Server Component** yapıldı,
`getAssetOverrides()` okur, override varsa onu basar, yoksa registry'deki varsayılanı.
**Çağıran hiçbir yer değişmedi.** `AssetOverride` modeli, 6 gerçek düzenlenebilir slot
(2 hakkımızda + 4 hizmetler). Override URL'leri **Supabase-media host'unda olmak zorunda**
(next/image `remotePatterns`).

> 🔑 **Ders:** Yeni bir "düzenlenebilirlik" isteği geldiğinde önce bu override desenini
> düşün. Bileşenlere dokunmadan davranış eklemenin yolu bu.

#### Diğer canlı modüller

| Modül | Nasıl çalışır |
|---|---|
| **Ürünler** | `Product` modeli + `ProductStatus` (DRAFT/PUBLISHED/HIDDEN). Çok dilli alanlar JSON kolonlarda. `src/server/products.ts` **tek veri sınırı**. Form tüm ürünü tek `payload` JSON'a serialize eder → zod ile doğrulanır. Public sayfalar `revalidate = 0` (düzenleme anında görünsün) |
| **Medya Kütüphanesi** | Supabase Storage public bucket `media` (10MB, sadece image mime). **Tüm yüklemeler sunucudan geçer** — tarayıcı Supabase ile asla konuşmaz. Storage yolu değişmez; yeniden adlandırma sadece DB etiketini değiştirir |
| **Mesajlar** | `ContactMessage` + durum (NEW/READ/ARCHIVED). Public `/api/contact` ek olarak DB'ye de yazar (best-effort try/catch — form sözleşmesi değişmedi). CSV export (UTF-8 BOM) |
| **Kullanıcılar** | SUPER_ADMIN'e özel. Korumalar: kendi rolünü/aktifliğini değiştiremezsin; **son aktif SUPER_ADMIN düşürülemez**. Hard-delete yok, devre dışı bırakma = soft-delete |
| **Site Ayarları** | Tek satırlık `SiteSetting` (id="site"), **tüm alanlar nullable** → boşsa `src/config/site.ts` varsayılanlarına düşer. Yani boş tablo = site aynen çalışır, seed gerekmez. Footer, iletişim sayfası ve analytics buradan besleniyor → sahibi **redeploy olmadan** analytics açabiliyor |

#### Kalanlar (sahibin tasarım kararı bekliyor)

| Nav'da "Yakında" | Gerçek durum |
|---|---|
| **Blog** | DB modeli **yok**, public sayfalar **yok**. Gerçek bir proje — model + admin CRUD + public liste/detay + i18n + SEO. Tasarım kararı gerekir |
| **Hizmetler** | ⚠️ **İçerik ZATEN düzenlenebilir** — `services` namespace'i `CONTENT_GROUPS`'ta "Hizmetler Sayfası" olarak var. Sahibi bunu Sayfalar & Metinler'den düzenliyor. Ayrı bir sayfa gerekmiyor olabilir |
| **Kategoriler** | Ürün kategorileri `src/config/product-options.ts` içinde sabit liste. DB'ye taşımak orta ölçekli iş |
| **SEO** | GSC doğrulaması ve structured-data e-posta/telefon **bilerek** env tabanlı bırakıldı — metadata refactor'ü riskli görüldü. Dokunmadan önce iki kez düşün |
| Revizyon geçmişi · içerik içi görsel düzenleme | Başlanmadı |

### 4.2 RADAR — "bu pazara girmeye değer mi?"
Kategori + hedef pazar gir → resmî ticaret verisinden **deterministik 0–100 fırsat skoru**.

**En kritik ilke: skor %100 kodda hesaplanır. Yapay zekâ sadece veriyi AÇIKLAR —
asla skor, ticaret rakamı veya HS kodu uydurmaz.** Her sayısal iddia kaynaklıdır.

- **Ağırlıklar (sahibi kilitledi):** Talep&Büyüklük 30 · Büyüme 20 · TR Tedarik Avantajı 25 ·
  Giriş Kolaylığı 15 · Rekabet Boşluğu 10
- **Bantlar:** ≥80 Araştırmaya Değer · 60–79 İzlenmeli · <60 Öncelik Değil
- **Kaynaklar (hepsi ücretsiz/resmî):** UN Comtrade (ana), Eurostat (yedek), WITS/UNCTAD (gümrük)
- **Snapshot'lar değişmezdir** — tekrar çalıştırma yeni satır açar, kullanılan ağırlıkları dondurur.
  Ağırlığı sonra değiştirmek geçmişi asla yeniden yazmaz.
- Sadece **VERIFIED** HS kodları skorlamaya girer. AI kod önerebilir, insan onaylar.

#### 🔴 EN DEĞERLİ BİLGİ: UN Comtrade ücretsiz endpoint'inin çalışma şekli

> Bu, saatler harcanarak deneme-yanılmayla bulundu. **Kaybedersen yeniden keşfetmek çok pahalı.**
> Dokümantasyondan anlaşılmıyor.

Endpoint: `https://comtradeapi.un.org/public/v1/preview/C/A/HS` (M49 ülke kodları kullanır)

**Ne ÇALIŞMAZ:**
- ❌ Çoklu `cmd` veya çoklu `period` göndermek → boş döner
- ❌ Aggregation filtreleri kullanmak → boş döner
- ❌ Filtresiz sorgu → **500 satır limitine** takılır ve dönen satırlar granüler
  `partner2` / `customs` / `mot` kırılımlarıdır — **gerçek toplamı gizler**

**Ne ÇALIŞIR — tek doğru primitif:**
```
reporter + partner + TEK cmd + TEK yıl + customsCode=C00 + motCode=0
```
- Temiz toplam = **`partner2Code === 0`** olan satır
- `partner=World` sorgulandığında, kaynak ülkeler **aynı cevaptaki**
  `partner2Code !== 0` satırlarıdır (ikinci istek atma!)

**Bu yüzden mimari böyle:** üst seviye metotlar bu primitifi sınırlı eşzamanlılıkla (6) döngüye
sokar + **30 günlük kalıcı ham cache** (`RadarRawCache`) kullanır, böylece çakışan ihtiyaçlar
ağa tekrar gitmez.

⚠️ Son yıllar (örn. 2024) ülkeler arası **düzensiz** raporlanır → varlık başına bir yıl geriye
düşme (fallback) mantığı peer/TR sepetini dolu tutar.

#### RADAR'ın ticari zekâ katmanı (V1.1)

Hepsi **dondurulmuş snapshot verisinden okuma anında** deterministik hesaplanır → eski
snapshot'lar skorlarını aynen korur. Migration gerekmedi.

- **İki ayrı skor:** *Pazar Fırsatı* (talep + büyüme + rekabet) vs ***AYZENITH Uyumu***
  (tedarik avantajı + giriş kolaylığı). "Pazar iyi" ≠ "biz uygunuz"
- **B2B / B2C ayrımı** mevcut `tradeModel` kolonunu kullanır (migration yok). `B2C_WEIGHTS`
  aynı 5 doğrulanmış kriteri tüketici merceğinden yeniden ağırlıklandırır.
  `B2C_UNMEASURED_SIGNALS` (gelir, e-ticaret yaygınlığı, nüfus, davranış) arayüzde
  **"ölçülmedi" diye açıkça yazılır — asla uydurulmaz**
- **Karar Güveni** — veri güveninden AYRI bir sayı. Eksik kriter, varsayılan gümrük, büyüme
  anomalisi, çelişki ve B2C ölçülemeyen sinyaller (−25) için puan düşer; asla veri güvenini aşamaz
- **Yoğunlaşma:** HHI → düşük/orta/yüksek bandı + isimleriyle ilk 10 tedarikçi ülke
- `deriveConflicts` (çelişkili sinyaller) · `deriveAnomalies` (|CAGR| ≥ 80 işaretlenir,
  otomatik "iyi" sayılmaz) · `rankProducts` (büyüklüğe değil **kompozit skora** göre sıralar)

#### 🔴 RADAR'ın dürüstlük doktrini (dilde bile geçerli)

| Kural | Neden |
|---|---|
| **VERİ YOK ≠ DÜŞÜK DEĞER** | "TR bağlantısı yok denecek kadar az" cümlesi SADECE tedarik ölçülmüş VE ihracat ≤ 0 iken kurulur. Ölçülemeyen veri ayrı bir **"Veri Sınırlamaları"** bölümüne gider — asla olumsuz çıkarım |
| **"ithalat" ≠ "talep"** | Kriter adı "Pazar Büyüklüğü & **İthalat Aktivitesi**". İthalat rakamı tüketici talebini kanıtlamaz |
| **B2C tavsiyesi B2B tavsiyesi değildir** | `decisionActions(model,…)` ikisini katı şekilde ayırır: B2B → ithalatçı/distribütör/toptancı; B2C → e-ticaret/marketplace + "tüketici talebi ölçülmedi" uyarısı |
| Kesin dil yasak | "kolay", "yüksek fırsat" gibi ifadeler yok; fırsatlar **sayıyla** verilir (en büyük tedarikçi payı %, HHI) |
| Sonuç ekranı üçe ayrılır | **Riskler** / **Çelişkili Sinyaller** / **Veri Sınırlamaları** |

#### RADAR anti-hedefi (taksonomi)

Bir HS kodu kategoriye "yakın duruyor" diye eklenmez. Örnek: `850760 Lityum-iyon aküler`
tüketici elektroniği altında VERIFIED'dı → **bileşen, bitmiş ürün değil** diye
NEEDS_REVIEW'a düşürüldü. ⚠️ Seed asla canlı satırı ezmez, dolayısıyla **canlı DB'de hâlâ
VERIFIED olabilir** — sahibinin HS Eşlemeleri ekranından düşürmesi gerekir.

> ### 🚫 RADAR'A DOKUNMA
> Yeni bir görevde açıkça "RADAR'ı değiştir" denmediyse RADAR'ın skoru, snapshot'ı, HS
> tablosu, discovery'si ve bağlantıları **aynen korunur.** Lead Finder çalışmaları RADAR'a
> asla sızmamalı.

### 4.3 LEAD FINDER — "peki orada kime satacağız?" (AKTİF ÇALIŞMA ALANI)
`/admin/lead-finder`. RADAR'ın yanında durur, onun yerine geçmez.

**Boru hattı:**
```
DISCOVERY (OSM) → DEDUP → CLASSIFY → WEBSITE VERIFY → SCORE → QUALIFY → SAVE → UI → EXPORT
```

**Sahibin kararları:**
- **$0 zorunlu API.** Sadece ücretsiz kaynak: OpenStreetMap/Overpass + firmanın **kendi web
  sitesi** (Impressum/Kontakt dahil). Ücretli kaynak mimaride eklenebilir ama **asla zorunlu
  değil, asla otomatik geçiş yok.**
- **Discovery ile doğrulama AYRIDIR.** OSM'de yok olması "böyle firma yok" demek değil.
- İlke: **az ama doğrulanmış lead > çok ama şüpheli lead.**
- **Skor ≠ Güven** — iki ayrı deterministik sayı. Eksik veri sessizce 0 yazılmaz;
  bileşen "ölçülemedi" işaretlenir ve skor yeniden normalize edilir.

**Nitelendirme kavramları (birbirinin yerine GEÇMEZ):**

| Kavram | Değerler |
|---|---|
| `productFit` | VERIFIED · LIKELY · UNCLEAR · NOT_RELEVANT · UNVERIFIED |
| `modelFit` | VERIFIED · POSSIBLE · NOT_SUITABLE · UNVERIFIED |

```
B2B VERIFIED        ≠ PRODUCT VERIFIED
PRODUCT VERIFIED    ≠ HIGH
B2C perakendeci + tedarik ≠ B2B müşterisi
Üretici             ≠ toptancı/distribütör
Genel kategori      ≠ ürün eşleşmesi
OSM shop etiketi    ≠ ticari model kanıtı
Website'de B2B kelimesi ≠ otomatik B2B iş modeli
```

**HIGH öncelik kapısı (yüksek skor TEK BAŞINA yetmez):**
`score ≥ 80` **VE** `modelFit = VERIFIED` **VE** `productFit = VERIFIED` **VE**
`website ACTIVE` **VE** gerçek iletişim kanalı.

---

## 5. MEVCUT DURUM — Lead Finder V3.2 (2026-08-14)

### Düzeltilen 4 kök neden

1. **B2C perakendeci + tedarikçi rolü → yanlışlıkla VERIFIED.**
   Artık `strongSupplier && buyer` → **POSSIBLE** ("iç tedarik zinciri olabilir").
   Sadece `strongSupplier && !buyer` → VERIFIED.

2. **Substring eşleşme felaketi.** `"import"` kelimesi **"important"** içinde eşleşiyordu;
   `"sourcing"` → **"outsourcing"**. C&A'ya "İthalatçı/Tedarik" etiketi bu yüzden yapışmıştı.
   Artık `ROLE_KEYWORDS` RegExp kabul ediyor: `/import(?!ant|ance)/`, `/(?<!out|re)sourcing/`.
   *(Düz string desteği korundu — "Elektrogroßhandel" gibi Almanca bileşik kelimeler
   "großhandel" ile eşleşmeye devam etsin diye.)*

3. **Doğrulama kuyruğu ham OSM sırasındaydı** — ilk 40 website. Gerçek toptancılar kesitin
   dışında kalıp kalıcı olarak `UNVERIFIED` → `DATA_LIMITED` oluyor, HIGH'a asla ulaşamıyordu.
   Artık kuyruk deterministik sıralanıyor (kanal uyumlu rol +4, ürün sinyali +2, çok şubeli +1).
   **Kapasite aynı (40), sadece sıra değişti.**

4. **Jenerik üst-kategori terimleri STRONG listesindeydi.**
   `unterwäsche` / `underwear` → MEDIUM'a indirildi (`damenwäsche` STRONG'a eklendi).
   Mutfak profilinden `haushaltswaren` silindi, yerine gerçek Großküchentechnik /
   Gastronomiebedarf terimleri kondu.

   **Kanıt:** `daemmisol.de` ve `schulzeshop.com` — ikisi de "Unterwäsche" kelimesini
   **iş güvenliği (PSA/PPE) katalog girdisi** olarak listeliyor:
   `Gummistiefel · Einwegschuhe · Unterwäsche · Socken · PSA · Gehörschutz`

### 6 canlı test (Berlin, gerçek OSM + DB)

| Test | Arama | Firma | HIGH | Kritik sonuç |
|---|---|---|---|---|
| A | iç giyim / B2B | 227 | **0** | C&A 95→59 LOW · Dämmisol product LIKELY |
| B | iç giyim / B2C | 139 | **3** | NKD · Widda&Co · Ralph Lauren (B2C korundu) |
| C | kulaklık / B2B | 194 | **0** | Apple/B&O/MediaMarkt/Saturn hepsi POSSIBLE |
| D | kulaklık / B2C | 107 | **7** | B&O · HiFi Klubben · Apple · Medimax |
| E | end. mutfak / B2B | 227 | **1** | Younes Service · Eisen-Philipp LOW'a düştü |
| F | Baumaterial / B2B | 139 | **1** | EcoBau Elemente |

`typecheck` ✅ · `lint` ✅ · `build` ✅ · migration **gerekmedi** · geçici test dosyaları temizlendi

### Bilinen kalan problemler

1. **`VERIFY_CAP = 40` / ~200 firma.** Firmaların ~%80'i hiç site doğrulamasından geçmiyor.
   Bunların `UNCLEAR`'ı "baktık belirsiz" değil **"bakmadık"** demek. Dürüst ama zayıf.
2. C&A iki ayrı kayıt olarak duruyor (biri domain'siz), dedup birleştiremedi.
3. C&A'nın OSM website etiketi yanlış (`cunda.de` gösteriyor) — OSM veri hatası.
4. `"gastronomie"` geniş bir STRONG terim, ileride MEDIUM'a çekilebilir.

---

## 6. SIRADAKİ İŞLER (istenmeden BAŞLAMA)

- Doğrulama kapasitesi / kademeli doğrulama (kalan problem #1)
- Daha derin B2B ithalatçı/distribütör keşfi
- Kamuya açık iş rehberleri (ücretsiz olanlar)
- Yeniden doğrulama / cache yaşam döngüsü arayüzü
- Veri Sağlığı ekranı, harita görünümü
- CMS tarafı: Blog, Hizmet/Kategori düzenleme, SEO düzenleme

---

## 7. ASLA YAPILMAYACAKLAR

```
❌ Ücretli servis eklemek — Google Places, SerpAPI, Apollo, Hunter, ücretli proxy/scraping,
   OpenAI/Anthropic API, Google Maps, LinkedIn API, Instagram API
❌ RADAR'ın skorunu / snapshot'ını / HS tablosunu değiştirmek
❌ Tahmini e-posta üretmek (firstname.lastname@ ASLA)
❌ Sosyal platform içi metrik uydurmak (takipçi, bio, son gönderi — login duvarı arkasında)
❌ Eksik veriyi olumlu saymak
❌ İstenmeyen özellik / mimari yeniden yazım
❌ Yeni kütüphane (tek istisna zaten alındı: exceljs)
```

---

## 8. OPS TUZAKLARI (acı çekilerek öğrenildi)

- **Dev preview çalışırken `next build` ÇALIŞTIRMA** — `.next` bozulur, sayfalar stilsiz açılır.
  Önce preview'i durdur → build → yeniden başlat. (`vercel --prod` uzakta build ettiği için güvenli.)
- **`server-only` paketi npm'de kurulu değil** — backend'i düz bir `tsx` script'inden
  çalıştıramazsın. İki yol: (a) Next route/server-action üzerinden çalıştır,
  (b) `node_modules/server-only/` altına geçici bir shim koy, işin bitince **sil**.
  Ayrıca `node --env-file=.env --import tsx <dosya>` ile `.env` yüklemeyi unutma.
- **Vercel env değişkenlerini Git Bash `printf` ile ekle** — PowerShell pipe'ı BOM ekleyip
  bozuyor (prod `DATABASE_URL` bir kez bu yüzden patladı).
- **OSM tag `=` eşleşmeleri BÜYÜK/küçük harfe duyarlı.** `area["name"="berlin"]` boş döner.
  Şehir girdisi normalize edilmeli ("berlin" → "Berlin"). Regex ile alan taramak çok ağır, timeout eder.
- **Overpass geçici boş cevap dönebilir** — bu ASLA cache'lenmemeli, yoksa 30 gün boyunca
  "0 sonuç" servis edilir. `shouldCache` koruması bu yüzden var.
- **HTML→PDF** (el kitapları için): Chrome headless. Chrome proje klasörüne yazamaz —
  scratchpad'e render edip `docs/`'a kopyala.

---

## 9. DOSYA HARİTASI (Lead Finder)

```
src/config/leads.ts                    Roller, ağırlıklar, ürün profilleri + STRONG/MEDIUM sinyaller,
                                       qualifiedPriority() kapısı
src/server/leads/
  ├─ providers/overpass.ts             OSM keşfi (sorgu genişletme, şehir yayılımı, mirror, retry)
  ├─ providers/website.ts              Site istihbaratı: erişilebilirlik, ürün terimleri, roller,
  │                                    model sinyalleri, e-posta/telefon, karar vericiler, sosyal
  │                                    linkler, pageContext() sayfa bağlamı
  ├─ cache.ts                          RADAR'ın RadarRawCache tablosunu paylaşır
  ├─ dedup.ts, classify.ts             Firma kimliği + şubeler · OSM → rol/boyut/ön ürün uyumu
  ├─ verify.ts                         computeModelFit() + productFit kademeleri  ★ ana mantık
  ├─ scoring.ts                        Deterministik 6 bileşenli skor
  ├─ run.ts                            Boru hattı orkestrasyonu + doğrulama kuyruğu sıralaması
  ├─ repo.ts, leads.ts, filter.ts      Veri katmanı
  └─ export.ts                         xlsx/csv — 4 sheet: Leads · Contacts · Sources · Locations

src/app/(admin)/admin/(dashboard)/lead-finder/    Arayüz
src/components/admin/leads/                       Kartlar, "Neden bu lead?" (why.ts)
```

### RADAR

```
src/config/radar.ts                    Ağırlıklar, eşikler, bölgeler, sertifika yükü, kategoriler
src/config/radar-hs-seed.ts            7 kategori için küratörlü HS-6 tablosu (WCO HS 2022)
src/server/radar/
  ├─ providers/comtrade.ts             ★ Ücretsiz endpoint primitifi (yukarıdaki kırmızı bölüm)
  ├─ providers/eurostat.ts, wits.ts    AB yedeği · gümrük vergileri
  ├─ cache.ts                          30 günlük ham cache (RadarRawCache)
  ├─ scoring.ts                        SAF fonksiyon — skorun tek kaynağı
  ├─ hs.ts                             HS eşleme CRUD, sadece VERIFIED skorlamaya girer
  ├─ analyze.ts                        Orkestrasyon: DATA → scoring
  ├─ ai.ts                             Sıkı korumalı AI yorumu; ANTHROPIC_API_KEY yoksa null
  │                                    döner ve SİSTEM YİNE ÇALIŞIR (AI opsiyoneldir)
  ├─ snapshot.ts                       Değişmez yazma + compareSnapshots
  └─ watch.ts                           Takip listesi, ±eşik uyarıları
src/components/admin/radar/insights.ts  Deterministik ticari zekâ (splitScores, HHI, çelişkiler)
src/app/api/radar/cron/route.ts         Haftalık cron (Bearer CRON_SECRET) + vercel.json
```

### CMS (override mimarisi)

```
src/lib/content-merge.ts               Saf birleştirme fonksiyonları
src/server/content.ts                  Metin override'ları (fail-safe {} döner)
src/server/assets.ts                   Görsel override'ları
src/i18n/request.ts                    Temel katalog + override birleşimi
src/config/content-schema.ts           17 Türkçe grup başlığı
src/config/asset-schema.ts             6 düzenlenebilir görsel slotu
src/components/ui/media.tsx            <Media> async Server Component
src/server/products.ts · media.ts · contact.ts · users.ts · settings.ts    Veri sınırları
```

---

## 9.5 AYZENITH'E ÖZEL İPUÇLARI

Bunlar dokümandan okunmaz, yaşayarak öğrenildi.

**1. Sistemin ruhu: "az ama doğrulanmış" > "çok ama şüpheli".**
Her tasarım kararında bu kazanır. Bir özellik daha fazla sonuç üretiyor ama bir kısmı
şüpheliyse — o özellik yanlıştır. Sahibi 200 şüpheli lead yerine 5 sağlam lead ister.

**2. Sahibi rakamların DOĞRULUĞUNU kontrol ediyor.**
Ayaz teknik değil ama sonuçlara bakıp "bu firma neden burada?" diye soruyor ve haklı çıkıyor.
C&A'nın B2B'de HIGH çıkması, Eisen-Philipp'in mutfak ekipmanı sanılması — hepsini o yakaladı.
**Sayı üretmeden önce o sayının savunulabilir olduğundan emin ol.**

**3. Almanca bileşik kelimeler substring eşleşmesini bozar.**
`"import"` → **"important"**. `"sourcing"` → **"outsourcing"**. `"wäsche"` → **"unterwäsche"**.
Ama düz substring eşleşmesini tamamen atma: `"großhandel"` teriminin
**"Elektrogroßhandel"** içinde eşleşmesi *isteniyor*. Doğru çözüm: varsayılan substring,
sorunlu terimler için RegExp.

**4. Bir terim "sektörde geçiyor" diye ürün kanıtı değildir.**
İnşaat malzemesi toptancısının menüsünde "Unterwäsche" olabilir — iş güvenliği içliği olarak.
**Terimin geçtiği BAĞLAMA bak**, sadece geçip geçmediğine değil.

**5. Eksik doğrulama ile olumsuz doğrulamayı ASLA karıştırma.**
`UNCLEAR` iki farklı şey olabilir: "baktık, belirsiz" veya "hiç bakmadık". İkincisini
birincisi gibi raporlamak sahibini yanıltır. Şu an `VERIFY_CAP=40` yüzünden firmaların
~%80'i ikinci gruptadır.

**6. Ücretsizlik bir tercih değil, kuraldır.**
"Şu API olsa çok daha iyi olurdu" diye düşünüyorsan — düşünmeyi bırak. Mimari ücretli
kaynak *eklenebilsin* diye modüler, ama hiçbir zaman *gerekmeyecek* şekilde.

**7. Türkçe arayüz metinlerinde AYZENITH tonu:** sakin, net, abartısız.
"Muhteşem fırsat!" yok. "Doğrulandı / Muhtemel / Belirsiz / Doğrulanamadı" var.
Belirsizliği saklamak yerine **etiketle**.

**8. Deploy öncesi refleks:** `typecheck → lint → build`. Üçü yeşil değilse deploy yok.
Ayrıca dev server açıkken **asla** `next build` çalıştırma.

**9. Sahibi işi toplu deploy etmeyi sever.** Küçük değişiklikleri biriktir, birlikte çıkar.

**10. Bir şeyi bilmiyorsan "bilmiyorum" de.** Bu projede en çok değer verilen davranış bu.
Uydurulmuş bir cevap, verilmemiş bir cevaptan çok daha pahalıya mal olur.

---

## 10. BİR GÖREVE BAŞLARKEN KONTROL LİSTESİ

1. Kodu **oku**, varsayma. Brief'teki firma/ürün iddialarını gerçek kaynaktan **doğrula**.
2. Mümkün olan **en küçük ve güvenli** değişikliği seç.
3. Migration gerekiyorsa **sadece additive**. Mümkünse migration'sız çöz.
4. RADAR / Social / Export / Dedup / Discovery-cache **regresyon kontrolü** yap.
5. `npm run typecheck` → `npm run lint` → `npm run build` — **üçü de yeşil olmalı.**
6. Geçici test dosyalarını **temizle**.
7. Raporu **ham veri + kısa yorum** olarak ver (Ayaz bunu başka bir AI'ya yapıştıracak).
8. Brief'in bir varsayımı yanlış çıktıysa **açıkça söyle**.
```
npm run typecheck && npm run lint && npm run build
```

---


---

# 11. GÜNCELLEME — 2026-08-16

> Bu bölüm 14 Ağustos'tan sonraki iki günü kapsar. Yukarısı hâlâ geçerlidir;
> aşağıdakiler onun üzerine gelir. **Önce bu bölümü oku** — bazı yerlerde
> yukarıdaki bilgiyi düzeltir.

## 11.1 Lead Finder — eklenen yetenekler

**Çok dilli doğrulama** (`src/server/leads/providers/lang.ts`)
Firma siteleri artık kendi dillerinde okunuyor. Metin sözlükleri **her zaman
açık** (maliyeti sıfır); yalnızca hangi alt sayfaların denendiği ülkeye göre
seçiliyor, istek sayısı değişmiyor. Canlı doğrulandı: Yamamay → VKN
`IT02649140122` (VIES'te geçerli, INTICOM S.P.A.), Calzedonia → "Calzedonia
S.p.A", Hunkemöller → "Hunkemöller B.V." + 700 mağaza.

**Wikidata marka bilgisi** (`providers/wikidata.ts`)
OSM bir zincirin *ne sattığını* söylemez. Wikidata söyler: P1056 (üretilen ürün),
P452 (sektör), P856 (resmî site). OSM'deki `brand:wikidata` etiketi üzerinden
bağlanır. Milano'da giyim mağazalarının %38'i bu etiketi taşıyor ve sekiz iç
giyim zincirinin sekizini de doğru tanıdı — Zara, H&M, Gucci ise "belirsiz"
kaldı, yani ayrım çalışıyor.
`findBrandQidByName` **bilerek katıdır**: büyük/küçük ve aksan normalize
edildikten sonra **tam eşleşme** şart, 6 karakterden kısa isimler reddedilir,
yalnızca sondaki şirket eki farklı olabilir. Gevşetme — yanlış eşleşme, uydurma
veri demektir.

**Derin analiz** (`src/server/leads/deepdive.ts`)
Arama akışının **dışında**, butonla çalışır. En umut verici 3 firmayı okur:
tüzel unvan, VKN (VIES'te doğrulanır), muhatap kanalları. Sitesi olmayan
zincirlerin resmî adresi Wikidata P856'dan bulunur — Calzedonia, Intimissimi ve
Yamamay'ın OSM'de sitesi yoktu, bu olmasa üçü de "bilgi yok" dönerdi.
Seçim kuralı: **ilgi düzeyi sıralar, ulaşılabilirlik giriş şartıdır.** İlk canlı
denemede Paris Lingerie (en ilgili ama sitesi/telefonu/e-postası yok) bir slotu
boşa harcamıştı; artık `reachabilityRank > 0` olmayan firma derin analize
girmiyor.

**Marka yükleme ekranı** (`src/components/ui/brand-loader.tsx`)
Ana sayfadaki dönen küre + AYZ üçgeni, RADAR ve Lead Finder yükleme
ekranlarında. Tüm animasyonlar `motion-safe:`.

## 11.2 Lead Finder — düzeltilen ciddi hatalar

**🔴 Ülke kısıtı yoktu** (`e4a0e20`)
Ülke "Almanya", şehir "milano" seçilen bir arama **İtalya'daki Milano'yu**
tarıyor, sonra bulduğu 133 İtalyan firmasına Alman bayrağı basıyordu. Telefonlar
+39, adresler Corso Buenos Aires, ülke "Almanya" ve **Pazar Uyumu 100/100**.
Sebep: şehir alanı yalnızca isimle eşleşiyordu, ülke ise veriden okunmuyor arama
formundan kopyalanıyordu.
Düzeltildi. **Overpass tuzağı — bunu bil:** şehir alanını ülkeyle filtrelemenin
bariz yolu (`area[...](area.c)->.a`) **sessizce yok sayılır**, hata vermez.
Ölçüldü: Almanya-Milano ve İtalya-Milano aynı 1842 sonucu döndürüyordu. Doğru
yöntem, **eleman sorgusuna iki alan filtresi** koymak: `(area.a)(area.c)`. Aynı
çift artık 0 ve 1842 veriyor.
Ayrıca boş sonucun türü ayrıştırıldı: "burada bu tür dükkân yok" ile "bu şehir bu
ülkede yok" artık ekranda ayrı yazıyor. Kontrol yalnızca sonuç boşsa çalışır.

**🔴 Zincirler ikiye bölünüyordu** (`04f9733`)
Firma kimliği, o şubenin OSM kaydında website etiketi olup olmamasına göre
değişiyordu. OVS 78 ve 59 puanla iki ayrı firma, METRO 74 ve 55 ile iki ayrı
firma olarak listeleniyordu — yani aynı şirket hakkında iki farklı karar.
İsimle eşleşen kayıtlar artık siteli kaydın altında birleşiyor, **ancak hedef
tekse**. İki farklı alan adı aynı ismi taşıyorsa birleştirmiyoruz; hangisine
katılacağını tahmin etmek uydurma olurdu. Ölçüm: 180 aday → 146 firma.
OVS hâlâ birden fazla satır — `ovs.it` ve `ovsfashion.com` ayrı alan adları,
ücretsiz kaynakta aynı tüzel kişi olduklarını söyleyen kanıt yok. **Bu bilinçli.**

**Derin analiz çelişkileri** (`e4a0e20`)
Sitesi yeni okunmuş bir firma hâlâ aramanın "Website bulunamadı." notunu
taşıyordu; profil "Website durumu: Aktif" ile "Website bulunamadı"yı yan yana
yazıyordu. Derin analiz artık kendi kararını da günceller. Karar verici paneli de
"sonraki aşamada devreye girecek" demeyi bıraktı — analiz yapıldıysa bunu söylüyor.

## 11.3 Bilinen açık konular (Lead Finder)

- **"Uzman mağaza" etiketi** — `shop=clothes` → `specialty_store` eşlemesi
  yüzünden **her firma** "Uzman mağaza" yazıyor: Zara da, H&M de, Gucci de.
  Veri hatası değil, etiket abartması; ama alan hiçbir bilgi taşımıyor.
  **Ayaz'ın kararını bekliyor** (`src/server/leads/classify.ts`, `SHOP_ROLE_MAP`).
- **`shop=wholesale` ürün körüdür.** Milano'da bu etiket inşaat malzemesi
  toptancılarıyla dolu; TEAM SIX 81 puanla listenin en yükseği ama kadın iç
  giyimle ilgisi yok. Kaynağın kalıcı sınırı. Sistem bunları "Ürün:
  Doğrulanamadı" işaretliyor ve öne çıkanlarda göstermiyor.
- **Eski aramalar veritabanında yanlış ülkeyle duruyor.** Düzeltme yeni
  kayıtlara işliyor; 16 Ağustos öncesi Milano araması hâlâ "Almanya" diyor.

## 11.4 Pazarlama malzemeleri (yeni iş alanı)

Hepsi `docs/` altında, **dosya olarak** — Ayaz barındırılan sayfa değil,
gönderebileceği belge istiyor.

| Dosya | Ne |
|---|---|
| `AYZENITH-Tanitim-Sunumu.html/.pdf` | RADAR + Lead Finder satış sunumu, TR |
| `AYZENITH-Tanitim-Videosu.mp4` | 65 sn, 1080p, Türkçe seslendirmeli tanıtım filmi |
| `AYZENITH-Tanitim-Videosu-Senaryo.md` | Senaryo + çekim planı |
| `AYZENITH-Video-Seslendirme-Prompt.md` | ElevenLabs metinleri ve ayarları |
| `AYZENITH-Katalog.html/.pdf` | Saç ekimi + medikal estetik kataloğu (ayrı iş) |
| `katalog-gorseller/` | Logolar ve 6 referans görseli |

**Sunum ve videonun dil kuralları — bunlar Ayaz'ın açık talimatı:**
- **Kaynakların adını yazma.** "maksat modelimiz çalınmasın" dedi. Yetenek
  anlat ("coğrafi işletme kayıtları", "AB kurumsal doğrulama sistemleri"),
  ürün adı verme (OpenStreetMap, Wikidata, VIES vs.).
- **Zayıflıkları açık sorun gibi sunma** — "sanki onları revize etmişiz gibi
  konuş". Bu ton kuralıdır; **olmayan bir yeteneği var gösterme kuralı değil.**
- **"Pazar / Alıcı / Muhatap" üçlüsü emekli edildi.** Ayaz beğenmedi; "muhatap"
  resmî yazışma kokuyor, çıplak isimler edilgen duruyor. Yerine modül adı +
  sorusu geçti. Her yerdeki kapanış cümlesi: *"Nereye ve kime satacağınızı
  bilerek başlayın."*
- **Sayı kullanmadan önce yeniden ölç.** Sunumun ilk huni rakamları (181→133)
  yanlış ülke etiketli aramadan gelmişti; düzeltmeden sonra aynı veri 180→146
  veriyor. Video bu yüzden **hiç rakam içermiyor.**

**Video nasıl üretiliyor** (`scratchpad/video/scene.html` + `render.mjs`)
Her görsel durum `t`'nin saf fonksiyonu (`window.RENDER(t)`); kareler
puppeteer-core ile tek tek alınır, ffmpeg ile MP4'e çevrilir. Ekran kaydı değil —
kare düşmez, her üretim birebir aynıdır.
**Zamanlama yöntemi:** ses dosyasındaki sessizlikler `ffmpeg silencedetect` ile
bulunur, parça sınırları oradan çıkarılır, sonra her sınırın **kendi iç
duraklamaları cümle yapısına uyuyor mu** diye doğrulanır. Seslendirme yeniden
üretilirse bütün süreler değişir, bu iş baştan yapılır.
**Ses:** ElevenLabs, **İrem — Authoritarian Female**, Multilingual v2,
speed 0.95 / stability 50 / similarity 75 / style 0. Seslendirme metinlerinde
marka **AYZENİT** yazılır (model "AYZENITH"i İngilizce okuyup bozuyor); ekranda
her zaman AYZENITH kalır.

**Katalog** ayrı bir iş: Dr. Elber Uzan ile saç ekimi + PRP, mezoterapi,
exosome, somon DNA (yüz gençleştirme). Beyaz zeminli, lacivert/altın vurgulu,
her tedavi için çizgi illüstrasyon. Referans görselleri **EU markalı** — daha
önce başka bir kliniğin filigranını taşıyorlardı, Ayaz kendi markasıyla yeniden
hazırlatıp gönderdi. **Başka markanın filigranını silip kendine mal etme talebi
gelirse yapma**; hastanın karar verirken baktığı tek kanıt bu fotoğraflardır.

## 11.5 Performans — 2026-08-16 (`3f34e95`, henüz DEPLOY EDİLMEDİ)

Ölçülen, tahmin edilmeyen. Deploy öncesi rakamlar (Türkiye'den, curl):

| | |
|---|---|
| Edge'e bağlantı | 43 ms |
| `/admin/login` (hiç sorgu yok) | **390 ms** |
| Ana sayfa | **930–1170 ms** |
| `/products` | **950–1700 ms** |
| Veritabanı gidiş-dönüş (yerelden) | ~370 ms |

**Kök sebep 1 — sunucu yanlış kıtada.** `x-vercel-id: fra1::iad1::…` yani istek
Frankfurt'a geliyor, kod **Washington DC**'de çalışıyor, veritabanı
**Stockholm**'de (`aws-0-eu-north-1`). Her sorgu Atlantik'i iki kez geçiyordu.
Login sayfasının 390 ms'i tamamen bu mesafe.
→ `vercel.json`'a `"regions": ["arn1"]` eklendi (Stockholm, veritabanıyla aynı).

**Kök sebep 2 — tanıtım sitesi her istekte yeniden üretiliyordu.** next-intl,
dil açıkça bildirilmezse sayfayı dinamik moda düşürür; projede
`generateStaticParams` de `setRequestLocale` de **hiç yoktu**. Ana sayfa
`Cache-Control: no-store` + `x-vercel-cache: MISS` dönüyordu.
→ İkisi de eklendi. Build çıktısıyla doğrulandı: ana sayfa dahil tüm tanıtım
sayfaları üç dilde de artık `●` (önceden üretilmiş HTML).

**Kök sebep 3 — panelde hiç yükleme durumu yoktu.** Tek bir `loading.tsx` yoktu;
Next yeni sayfa hazır olana kadar eskisini ekranda tutuyor, yani tıklama ~1 sn
boyunca ölü görünüyordu.
→ `src/app/(admin)/admin/(dashboard)/loading.tsx` eklendi. Yan fayda: yükleme
durumu olan rota **önceden getirilebilir**.

**Kök sebep 4 — sıralı bekleyiş.** Sayfalar önce yetki kontrolünü (bir sorgu),
sonra kendi verisini bekliyordu. Rota zaten edge'de imzalı çerezle korunduğu için
ikisi `Promise.all` ile paralelleştirildi.

**Yeni Claude'a görev:** deploy sonrası yukarıdaki dört ölçümü tekrarla ve farkı
rakamla ver. Tahmin etme.

## 11.6 SEO durumu

- Site **indekste var** (`site:www.ayzenith.com` sonuç veriyor).
- Teknik taraf temiz: robots.txt izinli, `x-robots-tag` yok, meta `index, follow`,
  canonical doğru, sitemap hreflang'li, apex→www ve http→https 308.
- **Eksik: `sameAs`.** Yapısal veride Organization/adres/telefon var ama sosyal
  hesap bağlantısı yok. Google marka kimliğini bununla kurar.
  Ayaz'dan LinkedIn/Instagram adresleri gelince `src/lib/seo.ts` içine eklenecek.
  **Hesapları uydurma.**
- Ayaz'ın yapması gerekenler (kod değil): Google İşletme Profili, LinkedIn şirket
  sayfası, Search Console'da sitemap gönderimi + "Request indexing".

## 11.7 Ortam notları (zaman kazandırır)

- **Yerel `.env` PRODUCTION veritabanına bakar.** `npx tsx --env-file=.env`
  ile herhangi bir değişikliği deploy etmeden canlı veriyle doğrulayabilirsin.
  Ayaz'ın en net geri bildirimi buydu: *"niye sürekli revize edip test ediyoruz,
  tek seferde çöz"* — deploy döngüsüne sokmadan kendin doğrula.
- `server-only` paketi kurulu değil. `src/server/*` içindeki bir modülü tsx ile
  çalıştıracaksan `node_modules/server-only/` altına iki satırlık bir stub aç
  (`package.json` + boş `index.js`). npm install bunu silebiliyor.
- **puppeteer-core** ve **ffmpeg** (winget, Gyan.FFmpeg) kurulu — video üretimi
  için. `package.json`'daki puppeteer-core devDependency budur.
- **Git commit mesajlarını `-F dosya` ile ver.** Bu ortam PowerShell; bash
  heredoc'u ile `git commit -m` karışınca mesajın başına `@` düşüyor.
- Bekleyen: `3f34e95` push+deploy edilmedi; `docs/` altındaki yeni dosyalar
  commit edilmedi.


---

*AYZENITH iç sistemleri — bu doküman süreç bilgisidir, pazarlama sitesinin içeriğini kapsamaz.*

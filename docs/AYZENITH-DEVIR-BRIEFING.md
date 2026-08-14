# AYZENITH — PROJE DEVİR BRIEFING'İ

> **Bu doküman ne işe yarar:** Yeni bir yapay zekâ asistanına (Claude, Codex, ChatGPT, fark etmez)
> bu dosyayı olduğu gibi yapıştır. Karşı taraf projeyi, kuralları, mevcut durumu ve nasıl
> çalışılması gerektiğini tek okumada kavrar.
>
> **Son güncelleme:** 2026-08-14 · **Durum:** Lead Finder V3.2 tamamlandı, build yeşil.

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

## 4. ÜÇ SİSTEM

### 4.1 CMS — `/admin` (BİTTİ, canlı)
Teknik olmayan sahibin siteyi kod yazmadan yönetmesi için. Ürünler, medya kütüphanesi,
iletişim kutusu, kullanıcılar, site ayarları, **"Sayfalar & Metinler"** (298 metnin 3 dilde
düzenlenebildiği override sistemi) ve **Görseller** sekmesi — hepsi canlı.

Kalanlar (sahibin tasarım kararı bekliyor): Blog, Hizmet/Kategori düzenleme, SEO düzenleme,
revizyon geçmişi.

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

*AYZENITH iç sistemleri — bu doküman süreç bilgisidir, pazarlama sitesinin içeriğini kapsamaz.*

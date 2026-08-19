# ElevenLabs — Seslendirme Talimatı

Yedi parça. Her birini **ayrı ayrı** üret, **ayrı MP3** olarak indir.

Kayıt yeri: `docs/video-ses/` klasörü, isimler `1.mp3`, `2.mp3` … `7.mp3`.
Klasörü açtım, hazır bekliyor.

---

## Ayarlar (bir kez yap, hepsinde aynı kalsın)

| Ayar | Değer | Neden |
|---|---|---|
| **Model** | Multilingual v2 *(ya da v3)* | Türkçe'yi düzgün okuyan model bu. İngilizce modeller "ı", "ğ", "ş" harflerini bozar. |
| **Stability** | **50** | Yükseltirsen robotlaşır, düşürürsen cümleden cümleye ton kayar. Yedi parça tek ağızdan çıkmış gibi durmalı. |
| **Similarity** | **75** | — |
| **Style** | **0** *(varsa)* | Abartılı vurgu bu videoya yakışmaz. |
| **Speed** | **0.95** *(varsa)* | Varsayılanın hafif altı. Acele eden ses ikna etmez. |

**Ses seçimi:** derin, sakin, orta yaş. Kadın ya da erkek fark etmez.
**Kaçın:** haber spikeri tonu, reklam sunucusu coşkusu, genç ve enerjik sesler. Bu bir satış videosu değil, bir **güven** videosu.

Bir parçayı beğenmezsen sadece onu yeniden üret — bu yüzden parçalara böldük.

---

## Metinler

Noktalama işaretlerine dokunma. Noktalar, virgüller ve üç noktalar duraklamaları yaratıyor; ElevenLabs bunları duyar. Bir virgülü kaldırmak ritmi bozar.

### 1 — Kanca · hedef ~7 sn

```
İhracat kararı çoğu zaman bir tavsiyeye dayanır. Bir fuar izlenimine... "Orada talep varmış" cümlesine.
```

### 2 — İki soru · hedef ~7 sn

```
Oysa her ihracat kararı, iki sorudan ibarettir. Hangi pazara gireceğim? Orada kime satacağım?
```

### 3 — RADAR · hedef ~10 sn

```
AYZENİT RADAR, birinci soruyu resmî ticaret verisiyle yanıtlar. Pazar büyüklüğünü değil... pazar fırsatını gösterir. Ve nedenini.
```

### 4 — Lead Finder · hedef ~12 sn

```
Lead Finder, ikinci soruyu yanıtlar. Seçtiğiniz pazardaki alıcıları bulur. Her firmanın ne sattığını, hangi ticari rolü üstlendiğini, ve gerçekten kim olduğunu doğrular.
```

### 5 — Eleme · hedef ~11 sn

```
Yüzlerce kayıttan yalnızca birkaçı gerçek alıcıdır. Sistem farkı ayırır. En umut verici firmaları derinlemesine inceler: tüzel kimlik, ölçek, muhatap kanalları.
```

### 6 — İki kitle · hedef ~8 sn

```
Üretici için: bütçeniz yalnızca gerçek adaylara gider. İş ortağı için: tekrarlanabilir bir pazar erişim altyapısı.
```

### 7 — Kapanış · hedef ~6 sn

```
Pazar. Alıcı. Muhatap. Üç soru... kaynaklarıyla birlikte yanıtlanır. AYZENİT.
```

---

## Marka adının yazımı

Metinlerde **AYZENİT** yazıyor, `H` yok. Bunu bilerek yaptık: model `AYZENITH` gördüğünde İngilizce okumaya çalışıp sonu bozuyor. `AYZENİT` yazınca Türkçe okunuşu doğru çıkıyor.

**Yazım yalnızca modele verilen talimattır, videoda görünmez.** Ekranda marka her zaman **AYZENITH** olarak yazılı kalır.

3. ve 7. parçada aynı yazımı kullan — tek videoda iki farklı telaffuz çok belli olur.

---

## Kredi hesabı

| | |
|---|---|
| Yedi parçanın toplamı | **845 karakter** |
| Bir tam tur maliyeti | **845 kredi** |
| 9.750 kredi ile | **11 tam tur** |

1 karakter = 1 kredi. En uzun parça 4 (169 karakter), en kısa parça 7 (77 karakter).

Rahatça dene, beğenmediğini tekrarla — ama şunu bil: **her "Generate" kredi harcar, dosyayı indirmesen bile.** Ayarlarla oynarken art arda üretme; önce sesi seç, sonra ayarları sabitle, en son yedi parçayı sırayla üret.

---

## v3 kullanıyorsan (isteğe bağlı)

v3 modelinde köşeli parantezle ton verebilirsin. Zorunlu değil, ama 1. parçada işe yarar:

```
[thoughtful] İhracat kararı çoğu zaman bir tavsiyeye dayanır. Bir fuar izlenimine... "Orada talep varmış" cümlesine.
```

Abartma. Tek videoda ikiden fazla etiket kullanma.

---

## Bitince

Yedi dosyayı `docs/video-ses/` klasörüne koy ve bana **"sesler hazır"** de. Gerisi bende:

1. Her dosyanın süresini milisaniyesine kadar ölçerim.
2. Animasyonu tam o sürelere göre yeniden çizerim.
3. Sesi videoya bindiririm.
4. Sana **sesli, bitmiş MP4** veririm.

Süreleri sen ölçmeyeceksin, hesaplamayacaksın, hizalamayacaksın. Sadece dosyaları klasöre at.

**Hedef sürelerden 1-2 saniye sapma sorun değil** — video sese uyacak, ses videoya değil. Ama bir parça hedefin iki katı çıkarsa haber ver, metni kısaltırız.

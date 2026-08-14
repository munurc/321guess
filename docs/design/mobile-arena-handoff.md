# 321guess — Mobil "Arena" Tasarım Dosyası (AI Tasarım Aracı Handoff)

Bu dosya, başka bir yapay zeka / tasarım aracıyla paylaşmak için hazırlandı. Aracın bu projeyle hiç önceden bağlantısı yok — aşağıdaki bağlam kendi başına yeterli olacak şekilde yazıldı.

## Proje nedir

**321guess**, futbolcu tahmin oyunu. Kullanıcıya iki kulüp logosu (veya bir ülke bayrağı + bir kulüp logosu) gösterilir, kullanıcı bu iki takımda da/bu ülkeden olup bu takımda oynamış bir futbolcuyu bulmaya çalışır.

- **Web sitesi** (`www.321guess.com`) zaten yayında ve tasarımı **hiç değişmeyecek** — soluk krem/koyu-yeşil, editoryal/dergi tarzı bir görünümü var.
- **Mobil uygulama** (iOS/Android, React Native/Expo Router — web ile aynı kod tabanından üretiliyor) şu an web'in tasarımını birebir kopyalıyor ve bu, fiziksel cihazda test edilince "düz, sıkıcı, app değil de web sayfası gibi" hissettirdi. Bu dosyanın amacı: **sadece mobil** için daha "app-native", oyun havası veren, canlı bir görsel kimlik tasarlamak.

## Teknik kısıtlar (önemli)

- Uygulama **React Native + Expo Router + NativeWind v4** (Tailwind CSS'in React Native versiyonu) ile yazılıyor. Yani üretilecek tasarım, Tailwind renk token'ları ve standart mobil UI bileşenleri (View, Pressable/Button, Image, TextInput) ile gerçekçi şekilde uygulanabilir olmalı — piksel-mükemmel ama React Native'de karşılığı olmayan efektler (örn. karmaşık SVG filtreleri, web-only CSS özellikleri) kullanılmamalı.
- Aynı kod tabanı hem web hem mobili render ediyor; **web tarafı değişmemeli**, yani component'ler platform bazlı stil ayrımı yapacak şekilde tasarlanmalı (aynı bileşen, mobilde farklı renk/stil kullanıyor).
- Kulüp logoları gerçek, dış kaynaklı görsellerdir (Wikipedia/Wikidata'dan çekiliyor), her zaman şeffaf arkaplanlı PNG/SVG. Tasarımda logo her zaman net/okunur kalmalı, üzerine ağır efekt binmemeli.
- Font: sistem sans-serif (iOS: SF Pro, Android: Roboto benzeri) — özel bir font lisansı yok, marka fontu şart değil.

## Ekranlar (mobilde tasarlanması istenen)

1. **Setup** — oyun modu seçimi (Günlük Meydan Okuma / Kulüp×Kulüp / Ülke×Kulüp / Manuel), zorluk seçimi (Kolay/Orta/Zor), lig filtreleri (checkbox listesi), "Başla" butonu.
2. **Manuel oyun** — kullanıcı arama kutusuyla iki kulüp (veya bir ülke + bir kulüp) seçer, "Cevabı Gör" butonuna basar, doğru oyuncu listesi açılır.
3. **Play / Countdown** — 3-2-1 geri sayım animasyonu, ardından soru ekranı: iki logo/bayrak + "Cevapları Göster" butonu + oyuncu listesi + "Sonraki Soru" butonu.
4. **Online / Günlük Meydan Okuma** — kullanıcı adıyla giriş, günün 5 sorusu (her biri iki kulüp logosu), bir arama kutusuna oyuncu adı yazıp tahmin gönderme, doğru/yanlış anlık geri bildirim, süre sayacı (1 dakika/soru), bitişte skor + seri (streak) + skor tablosu (liderlik) + paylaş butonu.

## Onaylanmış görsel yön (bu proje için zaten karar verildi — değiştirilmemeli, sadece detaylandırılacak)

**Stil adı: "Arena"** — spor/oyun temalı, koyu zeminli, sabit (cihazın açık/koyu mod ayarından bağımsız — uygulama mobilde her zaman bu koyu temada açılır).

**Renk paleti (hex):**
| Token | Hex | Kullanım |
|---|---|---|
| arena-bg | `#0F2A1E` | Ana zemin (koyu saha yeşili) |
| arena-bg-soft | `#153A28` | Kart/panel zemini (biraz daha açık) |
| arena-card | `#F7F5F0` | Logo madalyonlarının arka planı (neredeyse beyaz) |
| arena-accent | `#FFC738` | Ana aksiyon butonu yüzü (amber/sarı) |
| arena-accent-strong | `#C99418` | Ana butonun koyu "3D" alt kenarı |
| arena-accent-2 | `#2ECC8F` | İkincil/başarı aksiyon butonu, çerçeveler (turkuaz-yeşil) |
| arena-accent-2-strong | `#1F9C6C` | İkincil butonun koyu alt kenarı |
| arena-text | `#F0FBF5` | Ana metin (koyu zemin üstünde) |
| arena-text-soft | `#8FE8C4` | İkincil/açıklama metni |

**Buton dili:** "3D basılabilir" buton — düz renk yüzey + altında ~4-5px kalınlığında daha koyu bir "kenar" (Duolingo'nun butonlarına benzer), yuvarlak köşeler (rounded-2xl civarı), basılınca hafifçe küçülüp alt kenara "gömülme" hissi. Bu stil **sadece gerçek tıklanabilir aksiyonlarda** kullanılıyor: "Başla", "Tahmin Et", "Sonraki Soru", seçili mod kartı, dil değiştirici vb.

**Logo kutucukları (ÖNEMLİ — buton DEĞİL):** Kulüp logoları tıklanabilir değil, sadece soruyu gösteren görsel öğeler. Bu yüzden buton gibi görünmemeli:
- Yuvarlak (dairesel) madalyon şeklinde, `arena-card` (#F7F5F0) neredeyse-beyaz zemin.
- Kenarında o kulübün **kendi renginde** ince bir halka (çerçeve) — kalın "3D" gölge YOK, sadece hafif, nötr bir kart gölgesi.
- Her takımın rengi farklı olacağı için (logodan otomatik çıkarılıyor), aynı ekranda iki farklı renkte halka görünmesi normal ve istenen bir şey.
- Boş/seçilmemiş slot (Manuel modda ikinci takım seçilmeden önce): kesikli çizgili halka + ortada "+" işareti, `arena-accent-2` renginde.

**Diğer detaylar:**
- Dokunma animasyonu: butona basınca hafif küçülme (spring), bırakınca geri büyüme.
- Doğru tahminde: logo/kart üzerinde kısa bir parlama/glow veya küçük bir "patlama" animasyonu + titreşim (haptic) + kısa "doğru" sesi.
- Yanlış tahminde: kısa bir titreşim + "yanlış" sesi.
- Genel buton dokunuşunda: hafif haptic (dokunma hissi).
- Ses efektleri kısa (<1 saniye), oyuna uygun jenerik "ding"/"buzz" tarzı, mute edilebilir olacak.

## Ne isteniyor bu tooldan

Yukarıdaki 4 ekran için, "Arena" stilini uygulayan **mobil ekran mockup'ları / komponent tasarımları** üretilmesi. Özellikle şunlara odaklan:
- Setup ekranındaki mod seçim kartlarının tam görünümü (seçili vs seçili olmayan durum).
- Play/Online ekranındaki soru kartı (iki logo madalyonu + "vs" + arama kutusu + buton) tam kompozisyonu.
- Buton varyantları (ana/amber, ikincil/turkuaz, devre dışı durumu).
- İstersen ek bir ikon seti / illüstrasyon önerisi de ekleyebilirsin (örn. alev/streak ikonu, kupa ikonu) — bunlar şu an emoji (🏆🔥🛡️) ile placeholder durumda, gerçek ikonlarla değiştirilebilir.

**Çıktı formatı:** Figma dosyası, PNG/SVG mockup görselleri, ya da CSS/Tailwind class'ları şeklinde bir stil rehberi — hangisi bu aracın doğal çıktısıysa o. Kod üretiyorsa React Native + NativeWind (Tailwind className) formatında olması en kullanışlısı, ama şart değil; öncelik görsel yönün netleşmesi.

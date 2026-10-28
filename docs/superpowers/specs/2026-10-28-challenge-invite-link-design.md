# Meydan okuma davet linki — tasarım

Tarih: 2026-10-28 · Durum: taslak, onay bekliyor

## Amaç ve neden

Bugün Challenge Mode'da bir arkadaşa meydan okumak için o arkadaşın uygulamada
zaten bir kullanıcı adı olması gerekiyor. Uygulamayı hiç açmamış birini oyuna
almanın yolu yok. Kullanıcı arkadaşlarını WhatsApp'tan davet ediyor. Bir link
atmak, arkadaşın o linkle kullanıcı adı oluşturup doğrudan aynı meydan okumayı
oynaması isteniyor.

Kullanıcının ikinci hedefi büyüme: link bir WhatsApp grubuna atıldığında
**gruptaki herkes** aynı meydan okumayı oynayabilmeli. Her oynayan yeni bir
oyuncu demek. Uygulama henüz mağazada herkese açık değil, bu yüzden linkin ilk
deneyimi **web sitesinde, kurulum gerektirmeden** gerçekleşiyor.

## Kararlar (kullanıcının)

- Davet bir link olarak, kullanıcının seçtiği herhangi bir uygulamadan
  gönderilir. Kullanıcı en çok WhatsApp kullanıyor ama ürün WhatsApp'a
  yönlendirmez; sistem paylaşım menüsü açılır.
- Uygulaması olmayan arkadaş ilk meydan okumayı **tarayıcıda** (www.321guess.com)
  oynar. Uygulamayı indirmesi şart değil; sonda davet edilir.
- Linki açan **herkes** oynayabilir. Link tek kullanımlık değildir.
- Oynayan her kişi sonuçta **sadece kendisiyle link sahibinin karşılaştırmasını**
  görür. Linkin ortak skor tablosu yoktur.

## Hedefler

1. Gönderme ekranında, kullanıcı adı aramaya ek olarak **"Arkadaşını davet et"**
   düğmesi. Düğme telefonun kendi paylaşım menüsünü hazır bir mesajla açar:
   davet metni, link sahibinin skoru ve link. Belirli bir uygulamaya (örneğin
   WhatsApp'a) yönlendirilmez; kullanıcı WhatsApp'ı, Mesajlar'ı veya başka bir
   uygulamayı kendisi seçer. Bu kullanıcının kararı.
2. Link `https://www.321guess.com/m/<kod>` biçiminde olur. Tarayıcıda açılınca
   "**<kullanıcı> seni meydan okumaya davet etti**" ekranı çıkar.
   - Kullanıcı adı yoksa önce kullanıcı adı oluşturulur. Mevcut kural ve yasaklı
     kelime kontrolleri aynen geçerlidir.
   - Sonra 3-2-1 geri sayımı gelir. Bu zorunlu: geri sayım uygulamanın imzası ve
     her modda gösteriliyor.
   - Ardından link sahibinin oynadığı soruların aynısı oynanır.
3. Oyun bitince sonuç ekranında iki skor yan yana görünür. Altında uygulamayı
   indirme daveti vardır; mağaza linkleri yayına çıkana kadar bu bir
   "yakında / TestFlight" mesajı olabilir.
4. Link sahibi her oynayanın sonucunu bildirim ve Meydan Okumalar ekranında
   ayrı ayrı görür. Linki oynayan her kişi Rekabetler listesine ayrı bir rakip
   olarak eklenir; mevcut rekabet skoru mantığı kullanılır.
5. Bekleyenler'de link tek satır görünür: "Link ile paylaşıldı · N kişi oynadı".
   Diğer bekleyenler gibi **silinebilir**. Silinince link artık yeni kişi kabul
   etmez. O ana kadar oluşmuş bire bir sonuçlar korunur.
6. Uygulaması kurulu olan arkadaş, tarayıcıda ikinci bir kullanıcı adı açmak
   zorunda kalmamalı. Web davet sayfasında **"Uygulamada aç"** düğmesi olur:
   `guess321://m/<kod>`. Bu adres şeması mevcut build'de zaten tanımlı, yeni
   native build gerekmez. Uygulamada `/m/[code]` rotası aynı akışı uygulamadaki
   kimlikle yürütür.

## Hedef olmayanlar

- Linkin ortak skor tablosu yok; kullanıcının kararı.
- Linkle uygulamanın doğrudan açılması (iOS Universal Links / Android App
  Links) bu aşamada yok. Bunun için `associatedDomains` ve yeni bir native
  build gerekir. **2. aşama** olarak ayrı yapılacak.
- Mağazadan kurulum sonrası meydan okumanın hatırlanması (deferred deep link)
  yok.
- Mevcut "kullanıcı adıyla gönder" akışı değişmez; o akış yerinde kalır.

## Anti-hedefler (çalışsa bile başarısızlık sayılır)

- Linki açan arkadaşın kullanıcı adı oluşturmadan önce uzun bir kayıt veya giriş
  ekranıyla karşılaşması.
- Link sahibinin ve arkadaşın gördüğü soruların farklı olması.
- Bir kişinin aynı linki tekrar tekrar oynayarak skorunu düzeltebilmesi. Her
  oyuncu bir link için **bir kez** oynar; ikinci açılışta kendi sonucunu görür.
- Grupta bir kişinin oynaması diğerlerinin linkini "kullanılmış" yapması.

## Önerilen yapı

**Veri modeli:** Mevcut `challenges` satırı bire bir kalır. Link için bir
**şablon** eklenir:

- Yeni tablo: `challenge_links`
  - `code`: kısa, tahmin edilemez, URL'de kullanılır
  - `source_challenge_id`: link sahibinin oynadığı meydan okuma
  - `creator_token`
  - `created_at`, `expires_at`
  - `revoked_at`: silinince dolar
- Biri linki açıp oynamaya başladığında, şablondan **o kişiyle link sahibi
  arasında yeni bir `challenges` satırı** kopyalanır:
  - aynı `mode`/`difficulty`/`included_leagues`
  - `challenge_questions` kopyası
  - link sahibinin `challenge_scores` satırının kopyası
  - `delivery_type = 'link'`, `status = 'pending'`, `opponent_token = açan kişi`
  - yeni bir `link_code` sütunu, satırı linke bağlar

  Böylece mevcut `guess`/`finish`/rekabet/bildirim kodu değişmeden çalışır.
- Aynı kişi aynı linki tekrar açarsa yeni kopya oluşmaz, mevcut satırına
  yönlendirilir. Bunu `(link_code, opponent_token)` üzerinde tekil bir indeks
  garanti eder.

**API (apps/api):**

- `POST /api/challenges/[id]/link`: Link sahibi oynadıktan sonra çağırır. Kodu
  üretir ve URL döndürür. Aynı meydan okuma için ikinci çağrı aynı linki
  döndürür.
- `GET /api/links/[code]`: Herkese açık. Davet ekranı için link sahibinin
  kullanıcı adını, skorunu, mod/zorluğu ve linkin geçerli olup olmadığını
  döndürür. Soruların cevaplarını **döndürmez**.
- `POST /api/links/[code]/join`: `token` alır. Kişinin kopya meydan okumasını
  oluşturur ya da mevcut olanını döndürür, ardından meydan okumayı döner.
  Kendi linkini açan link sahibi reddedilir. Silinmiş veya süresi dolmuş link
  reddedilir.
- Liste (`/api/challenges/list`): Link şablonu Bekleyenler'de tek satır olarak
  gelir ve oynayan sayısını içerir. Linkten doğan bire bir satırlar link
  sahibinin Bekleyenler'inde **ayrı ayrı görünmez**; bitince Rekabetler'e düşer.
- `POST /api/challenges/[id]/cancel`: Bugünkü hâliyle zaten var. Link şablonu
  için de çalışacak şekilde genişletilir; şablon için `revoked_at` doldurulur.

**Web (apps/web, web çıktısı):**

- Yeni sayfa: `/m/[code]` (ve `/en/m/[code]`). Native tarafta aynı rota
  `guess321://m/<kod>` ile açılır ve uygulamadaki kimliği kullanır. Davet ekranı → gerekirse
  kullanıcı adı → geri sayım → oyun → sonuç + uygulama daveti.
- Mevcut web parçaları yeniden kullanılır:
  - web `GuessInput`
  - `online-storage` ile kimlik
  - kullanıcı adı formu
- Davet linki WhatsApp ve diğer mesajlaşma uygulamalarında önizleme gösterir. Sayfada link sahibinin adını
  içeren başlık ve açıklama (Open Graph) etiketleri olur.

**Uygulama (apps/web, native):**

- Gönderme ekranına "Arkadaşını davet et" düğmesi eklenir.
  - Linki API'den alır.
  - React Native `Share.share` ile sistem paylaşım menüsünü açar.
  - Web'de Web Share API kullanılır; yoksa link panoya kopyalanır.
- Bekleyenler'de link satırı gösterilir: oynayan sayısı ve Sil düğmesi.
- Bu değişiklikler JS düzeyinde, OTA ile gönderilebilir. Yeni native modül
  gerekip gerekmediği builder'ın kontrolünde; `Linking`/`Share` React Native'de
  hazır.

## Kısıtlar

- Sorular ve doğru cevaplar istemciye link sahibi oynamadan önce sızmamalı.
  Mevcut `toClientChallenge` token alanlarını zaten temizliyor; aynı dikkat
  link uçlarında da gösterilmeli.
- Kullanıcı adı kuralları ve yasaklı kelime listesi (`@321guess/core`
  `validateUsername`) web'de de aynen uygulanır.
- Link 7 gün geçerli; mevcut meydan okuma süresiyle aynı.
- **Web yayını:** www.321guess.com şu an 25 Ağustos'taki koddan yayında. Yeni
  `/m/` sayfasını yayınlamak web sitesine o tarihten bu yana yapılan her şeyi de
  çıkarır: redesign, Challenge değişiklikleri ve diğerleri. Web projesi GitHub'a
  bağlı olabilir. Yayın yöntemi ve zamanlaması kullanıcıyla netleştirilecek
  (aşağıdaki açık soruya bakın).

## Benim kararlarım (kontrol edin)

- **Kaynak meydan okuma:** Link sahibinin oynadığı kaynak satır, link
  oluşturulunca listede ayrıca görünmez. Bekleyenler'de yalnızca link satırı
  görünür.
- **Uygulamayı indir düğmesi:** Mağazalar açılana kadar düğme yerine "321guess
  çok yakında App Store ve Google Play'de" yazısı çıkar. Mağaza linkleri
  gelince düğmeye dönüşür.
- **Web'de oynayan arkadaşın hesabı:** Hesap tarayıcıda saklanır. İleride
  uygulamaya geçişi mevcut Apple/Google/e-posta hesap bağlama ile olur; bunun
  web'de çalıştığını builder doğrular. Çalışmıyorsa bu aşamada sadece not
  edilir, engel sayılmaz.
- **Kendi linkini açan link sahibi:** Oynatılmaz, kendi sonucunu ve kaç kişinin
  oynadığını görür.

## Builder'a bırakılanlar

- Link kodunun uzunluğu ve üretimi; kısa ama tahmin edilemez olmalı.
- `challenge_links` şemasının ayrıntıları ve migration dosyası
  (`apps/api/supabase/`). Migration'ı kullanıcı prod'da SQL Editor'den
  çalıştırır.
- Davet ve sonuç ekranlarının görsel ayrıntıları. Mevcut "arena" teması ve web
  stilleri kullanılır.
- Davet mesajı metninin TR/EN son hâli.

## Web yayını (karar verildi)

Link sayfası web sitesinde çalışacak; kullanıcı bunu kabul etti. Kullanıcı ayrıca
web sitesinin güncel koddan yayınlanacak yeni hâlini **yayına çıkmadan önce
görsel olarak görmek** istiyor. Web yayını, kullanıcı bu önizlemeyi onayladıktan
sonra yapılır.

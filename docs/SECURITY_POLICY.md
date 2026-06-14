# Güvenlik Politikası (Security Policy)

**Son Güncelleme:** Haziran 2026

Clofthel olarak, anime severlere sunduğumuz altyapının, kişisel verilerin ve sistem kaynaklarının güvenliğini ciddiye alıyoruz. Bu doküman, uygulamamızın güvenlik felsefesini, teknik önlemlerini ve zafiyet bildirim süreçlerini şeffaf bir şekilde açıklar.

## 1. Zero Hardcoded Secrets (Sıfır Açık Parola) Yaklaşımı

Uygulamanın kaynak kodunda ve veritabanı yollarında üçüncü parti hassas API anahtarları düz metin (plain text) olarak sunucuya açık şekilde barındırılmaz. İstemci (Client) tarafında bulunan anahtarlar ise yalnızca **HMAC imzalama algoritması** için yerel olarak kullanılır ve asla ağ üzerinde (network) çıplak bir şekilde taşınmaz.

## 2. API Güvenliği ve İstek Doğrulama (Request Signing)

Clofthel sunucuları dışarıya tamamen kapalıdır. Yetkisiz girişleri önlemek için aşağıdaki mimari kullanılır:

- **HMAC-SHA256 İmzalama:** Resmi mobil uygulamamız üzerinden atılan her API isteği (veri çekme, profil kaydetme vb.) cihaz tarafından dinamik olarak üretilen bir "Zaman Damgası" (Timestamp) ve "Rastgele Üretilen Metin" (Nonce) ile birlikte saf JavaScript motoru üzerinde gizli bir anahtar kullanılarak imzalanır.
- **Gizli Anahtar Maskeleme (Obfuscation):** Mobil uygulama içinde kullanılan statik gizli anahtar, kaynak kodda düz metin (plain-text) olarak saklanmaz. APK decompile edildiğinde doğrudan kelime aramasıyla (string search) ele geçirilmesini zorlaştırmak amacıyla karakter kodları tablosu halinde saklanır ve runtime esnasında dinamik olarak çözülür.
- **Hermes Bytecode Koruması:** Üretim (Production) APK çıktısı alınırken Expo Hermes derleyicisi aktif edilir. Bu sayede JavaScript kodları ve maskelenmiş anahtarlar düz metin bir paket (.jsbundle) yerine doğrudan optimize edilmiş bytecode formatına dönüştürülür ve tersine mühendislik aşaması ciddi ölçüde zorlaştırılır.
- **Replay Attack Koruması:** Sunucumuz, bu isteği aldığı anda zaman farkını hesaplar. Eğer atılan istek 15 saniyeden eski ise, bu istek "ağa sızan bir saldırganın isteği tekrarladığı" (Replay Attack) şüphesiyle reddedilir.
- **Man-in-the-Middle (MitM) Koruması:** API imzasını oluşturan algoritma cihazın yerel belleğinde (`crypto-js` ile) çalışır ve ağ izleme araçlarıyla (Postman, Wireshark) çözülemez. İstek başlıkları manipüle edilemez.


## 3. Sistem İçi Şifreleme (Encryption in Transit and at Rest)

- **Şifreleme (At Rest):** Veritabanımıza kaydedilen tüm kullanıcı şifreleri tek yönlü güçlü `bcrypt` algoritmalarıyla "tuzlanarak" (salting) şifrelenir.
- **Aktarım (In Transit):** Sunucumuz ile kullanıcının cihazı arasındaki tüm bağlantılar HTTPS / SSL (Secure Socket Layer) üzerinden gerçekleşir, aradaki veri kesinlikle dinlenemez.
- **Cihaz Seviyesi (Device Level):** Kullanıcının oturum erişim anahtarı (JWT) ve uygulamanın Yasal Onay (EULA) durumları, Native (Çekirdek) seviyesinde çökmeleri önlemek amacıyla stabil çalışan şifrelenmiş bellek yöneticileriyle cihazda tutulur.

## 4. Tehdit Engelleme Mekanizmaları

- **NoSQL Injection Koruması:** Zararlı kod barındıran MongoDB sorgularını (Injection) temizleyen aktif bir filtre devrededir.
- **XSS Clean:** Formlardan gelebilecek HTML/JavaScript sızıntıları otomatik olarak silinir.
- **Rate Limiting & IP Blocking:** Sunucumuzu gereksiz yere yorarak erişimi engellemeye (DDoS) veya şifre kırmaya çalışan sistemlerin, ayrıca spam yorum atanların IP adresleri kalıcı olarak bloke edilir.
- **Web Sitesi Yazma Kısıtlamaları (Write Restrictions):** Clofthel'in ana web sitesi üzerinden sunucu veritabanına doğrudan veri yazılamaz. Site üzerindeki tüm formlar (Yorumlar hariç) salt okunurdur. Kayıt ekleme veya anime kaynağı güncelleme uç noktaları özel API anahtarlarıyla korunur.
- **Korsan Yayıncılığa Karşı Web İzolasyonu (Anime İzleme):** Telif hakları ihlallerini önlemek ve yüksek sunucu güvenliğini korumak amacıyla, anime izleme (Streaming) modülü web sitesinden tamamen kaldırılmıştır. Videolar yalnızca özel ve şifrelenmiş Player'lara sahip Masaüstü (Windows) veya Mobil (Android) uygulamalarından izlenebilir.

## 5. Güvenlik Açığı Bildirimi (Vulnerability Disclosure)

Eğer Clofthel sisteminde bir güvenlik açığı tespit ettiğinizi düşünüyorsanız, lütfen bu durumu halka açık yerlerde (Forumlar, GitHub sorunları vb.) paylaşmadan önce, sorunu güvenli bir şekilde bizimle paylaşın. Bildirimleriniz ekibimiz tarafından acil kod ile incelenir ve hızlıca yama uygulanır.

Uygulamayı güvenli kıldığınız ve kurallara uyduğunuz için teşekkür ederiz.

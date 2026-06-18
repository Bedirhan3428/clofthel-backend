import Link from 'next/link';
import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Güvenlik Politikası | Clofthel',
  description: 'Clofthel güvenlik politikası — sistem mimarisi ve güvenlik önlemleri.',
};

const sections = [
  {
    number: '01',
    title: 'Zero Hardcoded Secrets Yaklaşımı',
    badge: 'Şifre Güvenliği',
    content: `Uygulamanın kaynak kodunda ve veritabanı yollarında üçüncü parti hassas API anahtarları düz metin (plain text) olarak sunucuya açık şekilde barındırılmaz.\n\nİstemci (Client) tarafında bulunan anahtarlar ise yalnızca HMAC imzalama algoritması için yerel olarak kullanılır ve asla ağ üzerinde çıplak bir şekilde taşınmaz.`,
  },
  {
    number: '02',
    title: 'API Güvenliği ve İstek Doğrulama',
    badge: 'Request Signing',
    content: `Clofthel sunucuları dışarıya tamamen kapalıdır. Yetkisiz girişleri önlemek için aşağıdaki mimari kullanılır:\n\n• HMAC-SHA256 İmzalama: Her API isteği dinamik olarak üretilen Zaman Damgası (Timestamp) ve Rastgele Üretilen Metin (Nonce) ile imzalanır.\n\n• Gizli Anahtar Maskeleme: APK decompile edildiğinde doğrudan kelime aramasıyla ele geçirilmesini zorlaştırmak amacıyla karakter kodları tablosu halinde saklanır.\n\n• Hermes Bytecode Koruması: Üretim APK çıktısında JavaScript kodları optimize edilmiş bytecode formatına dönüştürülür.\n\n• Replay Attack Koruması: 15 saniyeden eski istekler otomatik olarak reddedilir.\n\n• MitM Koruması: İmza algoritması cihazın yerel belleğinde çalışır ve ağ izleme araçlarıyla çözülemez.`,
  },
  {
    number: '03',
    title: 'Sistem İçi Şifreleme',
    badge: 'Encryption',
    content: `• Şifreleme (At Rest): Veritabanımıza kaydedilen tüm kullanıcı şifreleri tek yönlü güçlü bcrypt algoritmalarıyla "tuzlanarak" (salting) şifrelenir.\n\n• Aktarım (In Transit): Sunucumuz ile kullanıcının cihazı arasındaki tüm bağlantılar HTTPS / SSL üzerinden gerçekleşir, aradaki veri kesinlikle dinlenemez.\n\n• Cihaz Seviyesi: Kullanıcının oturum erişim anahtarı (JWT), Native seviyesinde şifrelenmiş bellek yöneticileriyle cihazda tutulur.`,
  },
  {
    number: '04',
    title: 'Tehdit Engelleme Mekanizmaları',
    badge: 'DDoS & Injection',
    content: `• NoSQL Injection Koruması: Zararlı kod barındıran MongoDB sorgularını temizleyen aktif bir filtre devrededir.\n\n• XSS Clean: Formlardan gelebilecek HTML/JavaScript sızıntıları otomatik olarak silinir.\n\n• Rate Limiting & IP Blocking: Sunucumuzu gereksiz yere yorarak DDoS veya şifre kırmaya çalışan sistemlerin IP adresleri kalıcı olarak bloke edilir.\n\n• Web Sitesi Yazma Kısıtlamaları: Clofthel web sitesi üzerinden sunucu veritabanına doğrudan veri yazılamaz. Kayıt ekleme veya güncelleme uç noktaları özel API anahtarlarıyla korunur.\n\n• Web İzolasyonu: Anime izleme modülü web sitesinden tamamen kaldırılmıştır. Videolar yalnızca özel ve şifrelenmiş uygulamalardan izlenebilir.`,
  },
  {
    number: '05',
    title: 'Güvenlik Açığı Bildirimi',
    badge: 'Vulnerability Disclosure',
    content: `Eğer Clofthel sisteminde bir güvenlik açığı tespit ettiğinizi düşünüyorsanız, lütfen bu durumu halka açık yerlerde (Forumlar, GitHub vb.) paylaşmadan önce, sorunu güvenli bir şekilde bizimle paylaşın.\n\nBildirimleriniz ekibimiz tarafından acil kod ile incelenir ve hızlıca yama uygulanır. Uygulamayı güvenli kıldığınız ve kurallara uyduğunuz için teşekkür ederiz.`,
  },
];

export default function SecurityPage() {
  return (
    <div className="min-h-screen bg-[#0a0a0c] text-[#f4f4f7] font-sans antialiased">
      {/* Header */}
      <header className="sticky top-0 z-50 w-full px-6 py-4 bg-[#0a0a0c]/80 backdrop-blur-md border-b border-white/5">
        <div className="max-w-5xl mx-auto flex justify-between items-center">
          <Link href="/" className="flex items-center gap-3 group">
            <img src="/mainLogo.png" alt="Clofthel" className="h-9 w-auto group-hover:scale-105 transition-transform" />
            <span className="font-extrabold text-xl tracking-tight bg-gradient-to-r from-[#ff6b00] to-[#ff8e3c] bg-clip-text text-transparent hidden sm:block">Clofthel</span>
          </Link>
          <Link href="/" className="text-sm text-[#8e8e9f] hover:text-white transition-colors font-medium">← Ana Sayfa</Link>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-20">
        {/* Hero */}
        <div className="mb-16 text-center">
          <p className="text-[#ff6b00] text-xs font-black uppercase tracking-widest mb-4">Yasal Bilgi</p>
          <h1 className="text-5xl md:text-7xl font-black tracking-tight mb-6">
            Güvenlik <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#ff6b00] to-[#ff8e3c]">Politikası</span>
          </h1>
          <p className="text-[#8e8e9f] text-lg max-w-2xl mx-auto leading-relaxed">
            Sistem mimarimiz sıfırdan güvenlik anlayışıyla inşa edilmiştir. Teknik önlemlerimizi şeffaf bir şekilde paylaşıyoruz.
          </p>
          <p className="mt-4 text-xs text-[#8e8e9f]/60 font-medium">Son Güncelleme: Haziran 2026</p>
        </div>

        {/* Sections */}
        <div className="flex flex-col gap-6">
          {sections.map((s) => (
            <div key={s.number} className="group bg-[#121217] border border-white/5 rounded-2xl p-8 hover:border-white/10 transition-all duration-300">
              <div className="flex items-start gap-6">
                <span className="text-[#ff6b00]/20 font-black text-5xl leading-none select-none group-hover:text-[#ff6b00]/40 transition-colors shrink-0">{s.number}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-3 mb-4">
                    <h2 className="text-xl font-black text-white">{s.title}</h2>
                    <span className="text-[10px] font-black uppercase tracking-widest bg-[#ff6b00]/10 text-[#ff6b00] border border-[#ff6b00]/20 px-2 py-1 rounded-md">{s.badge}</span>
                  </div>
                  <p className="text-[#8e8e9f] leading-relaxed whitespace-pre-line text-sm">{s.content}</p>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Policy links */}
        <div className="mt-16 border-t border-white/5 pt-10 flex flex-wrap justify-center gap-6 text-sm text-[#8e8e9f]">
          <Link href="/terms-of-services" className="hover:text-white transition-colors">Hizmet Şartları</Link>
          <span className="text-white/20">·</span>
          <Link href="/privacy-policy" className="hover:text-white transition-colors">Gizlilik Politikası</Link>
          <span className="text-white/20">·</span>
          <Link href="/" className="hover:text-white transition-colors">Ana Sayfa</Link>
        </div>
      </main>
    </div>
  );
}

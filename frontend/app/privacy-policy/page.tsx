import Link from 'next/link';
import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Gizlilik Politikası | Clofthel',
  description: 'Clofthel gizlilik politikası — verileriniz nasıl toplanır ve korunur.',
};

const sections = [
  {
    number: '01',
    title: 'Topladığımız Veriler',
    content: `Uygulamamızı kullanırken aşağıdaki bilgileri toplayabiliriz:\n\n• Hesap Bilgileri: Adınız, e-posta adresiniz, şifreniz (kriptolanmış olarak) ve profil fotoğrafınız (Google ile giriş yapıldığında).\n\n• Kullanım Verileri: İzleme geçmişiniz, favori animeleriniz, oluşturduğunuz listeler ve bildirim tercihleriniz.\n\n• Cihaz ve Bağlantı Verileri: Cihaz işletim sistemi, IP adresi (geçici olarak, güvenlik amacıyla) ve Push bildirimleri için cihaz token'ı.`,
  },
  {
    number: '02',
    title: 'Verilerin Kullanımı',
    content: `Topladığımız veriler aşağıdaki amaçlar için kullanılır:\n\n• Uygulama hizmetlerini sunmak ve sürdürmek.\n• Anime öneri algoritmamızı (AI tabanlı) kişiselleştirmek.\n• İzleme geçmişinizi ve cihazlar arası senkronizasyonu sağlamak.\n• E-posta (şifre sıfırlama, doğrulama) ve uygulama içi bildirimler göndermek.\n• Kötü niyetli kullanımı, siber saldırıları ve API suistimallerini engellemek.`,
  },
  {
    number: '03',
    title: 'Veri Güvenliği',
    content: `Kişisel verilerinizin güvenliği bizim için en büyük önceliktir:\n\n• Şifreleme: Şifreleriniz sunucularımızda hiçbir zaman düz metin olarak saklanmaz. bcrypt algoritması ile geri döndürülemez şekilde şifrelenir.\n\n• Cihaz Güvenliği: Mobil uygulamanızda oturum açtığınızda oluşturulan erişim anahtarları (JWT), telefonunuzun donanımsal güvenlik çipinde (Keystore/Keychain) saklanır.\n\n• Aktarım Güvenliği: Sunucularımız ve uygulamanız arasındaki tüm veri transferleri dinamik kriptografik imzalar (HMAC-SHA256) ve SSL/HTTPS protokolleri ile şifrelenir.`,
  },
  {
    number: '04',
    title: 'Veri Paylaşımı ve Üçüncü Taraflar',
    content: `Clofthel, kişisel verilerinizi asla reklam veya pazarlama amacıyla üçüncü şahıslara satmaz. Ancak aşağıdaki durumlarda güvenilir iş ortaklarıyla veri paylaşılabilir:\n\n• E-posta Hizmetleri: Doğrulama ve şifre sıfırlama mailleri için Resend servisi kullanılmaktadır.\n\n• Oturum Açma Servisleri: Google ile giriş yapıldığında Google'ın OAuth 2.0 altyapısı kullanılır.\n\n• Yasal Zorunluluklar: Mahkeme kararı veya geçerli bir yasal talep doğrultusunda yetkili makamlarla veri paylaşılabilir.`,
  },
  {
    number: '05',
    title: 'Kullanıcı Hakları',
    content: `Kullanıcılarımız olarak şu haklara sahipsiniz:\n\n• Hesabınızdaki bilgileri dilediğiniz zaman düzenleyebilir veya profilinizi silebilirsiniz.\n\n• Hesabınızı sildiğinizde, sunucularımızdaki size ait tüm kişisel veriler, izleme geçmişi ve favorileriniz geri alınamaz şekilde veri tabanından silinir.`,
  },
  {
    number: '06',
    title: 'Değişiklikler',
    content: `Zaman zaman Gizlilik Politikamızı güncelleyebiliriz. Önemli bir değişiklik olduğunda sizi uygulama içerisinden veya e-posta yoluyla bilgilendireceğiz.\n\nGizlilikle ilgili sorularınız için bizimle iletişime geçebilirsiniz.`,
  },
];

export default function PrivacyPage() {
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
            Gizlilik <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#ff6b00] to-[#ff8e3c]">Politikası</span>
          </h1>
          <p className="text-[#8e8e9f] text-lg max-w-2xl mx-auto leading-relaxed">
            Verilerinize saygı duyuyoruz. Clofthel'de kişisel bilgileriniz nasıl işleniyor, şeffaf bir şekilde açıklıyoruz.
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
                  <h2 className="text-xl font-black mb-4 text-white">{s.title}</h2>
                  <p className="text-[#8e8e9f] leading-relaxed whitespace-pre-line text-sm">{s.content}</p>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Policy links */}
        <div className="mt-16 border-t border-white/5 pt-10 flex flex-wrap justify-center gap-6 text-sm text-[#8e8e9f]">
          <Link href="/terms-of-service" className="hover:text-white transition-colors">Hizmet Şartları</Link>
          <span className="text-white/20">·</span>
          <Link href="/security-policy" className="hover:text-white transition-colors">Güvenlik Politikası</Link>
          <span className="text-white/20">·</span>
          <Link href="/" className="hover:text-white transition-colors">Ana Sayfa</Link>
        </div>
      </main>
    </div>
  );
}

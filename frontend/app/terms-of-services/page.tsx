import Link from 'next/link';
import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Hizmet Şartları | Clofthel',
  description: 'Clofthel hizmet şartları ve kullanım koşulları.',
};

const sections = [
  {
    number: '01',
    title: 'Hizmetin Kapsamı',
    content: `Clofthel, kullanıcıların anime keşfetmesini, listeler oluşturmasını, izleme geçmişini takip etmesini ve yapay zeka tabanlı öneriler almasını sağlayan bir anime platformudur.`,
  },
  {
    number: '02',
    title: 'Kullanıcı Sorumlulukları',
    content: `Clofthel'i kullanırken aşağıdaki kurallara uymayı kabul edersiniz:\n\n• Uygulamayı yasadışı, hileli veya zararlı amaçlar için kullanamazsınız.\n\n• Tersine Mühendislik: Uygulamanın kaynak kodunu kırmaya (decompile), içindeki API anahtarlarını çıkartmaya veya sunucu mimarisini çözmeye çalışamazsınız.\n\n• Sistem Suistimali: Sunucularımıza aşırı yük bindirecek botlar, scriptler veya otomatik veri kazıma araçları kullanarak API hizmetlerini suistimal edemezsiniz. Tespit edilmesi halinde IP adresiniz ve hesabınız kalıcı olarak yasaklanacaktır.\n\n• Hesabınızın güvenliğini sağlamak sizin sorumluluğunuzdadır.`,
  },
  {
    number: '03',
    title: 'Fikri Mülkiyet',
    content: `Clofthel'in yazılım mimarisi, tasarımı ve kod tabanı tamamen bize aittir.\n\nUygulama içinde sergilenen animelere ait afişler, açıklamalar ve yayın verileri (metadata) Kitsu, AniList, Jikan gibi üçüncü parti sağlayıcılara aittir ve bilgilendirme/eğlence amaçlı sunulmaktadır. Clofthel bu içerikler üzerinde telif hakkı iddia etmez.`,
  },
  {
    number: '04',
    title: 'Hesabın Askıya Alınması',
    content: `Gizlilik Politikası veya Hizmet Şartlarının ihlal edildiğinin tespit edilmesi durumunda, Clofthel herhangi bir ön bildirimde bulunmaksızın hesabınızı dondurma veya kalıcı olarak silme hakkını saklı tutar.`,
  },
  {
    number: '05',
    title: 'Sorumluluk Reddi',
    content: `Clofthel, hizmeti "olduğu gibi" sunar ve kesintisiz veya hatasız çalışacağını garanti etmez.\n\nBakım, güncelleme veya sunucu sorunları nedeniyle uygulamaya erişim geçici olarak durabilir. Uygulamanın kullanımından doğabilecek dolaylı veri kayıpları veya aksaklıklardan Clofthel sorumlu tutulamaz.`,
  },
  {
    number: '06',
    title: 'Şartların Değiştirilmesi',
    content: `Clofthel, bu hizmet şartlarında dilediği zaman değişiklik yapma hakkını saklı tutar. Değişiklikler yayınlandığı andan itibaren geçerli sayılır.`,
  },
];

export default function TermsPage() {
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
            Hizmet <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#ff6b00] to-[#ff8e3c]">Şartları</span>
          </h1>
          <p className="text-[#8e8e9f] text-lg max-w-2xl mx-auto leading-relaxed">
            Clofthel'i kullanarak bu şartları kabul etmiş sayılırsınız. Lütfen dikkatli okuyun.
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
          <Link href="/privacy-policy" className="hover:text-white transition-colors">Gizlilik Politikası</Link>
          <span className="text-white/20">·</span>
          <Link href="/security-policy" className="hover:text-white transition-colors">Güvenlik Politikası</Link>
          <span className="text-white/20">·</span>
          <Link href="/" className="hover:text-white transition-colors">Ana Sayfa</Link>
        </div>
      </main>
    </div>
  );
}

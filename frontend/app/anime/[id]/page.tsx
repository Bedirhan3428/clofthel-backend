'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { FaWindows, FaAndroid, FaStar, FaExclamationTriangle, FaLock, FaDownload, FaInstagram } from 'react-icons/fa';

interface AnimeDetail {
  _id: string;
  tranimeizle_slug: string;
  tranimeizle_url: string;
  anilist_id: number | null;
  orijinal_ad: string | null;
  format: string | null;
  total_episodes: number | null;
  episodes: Record<string, string>;
}

function formatSlug(slug: string): string {
  if (!slug) return '';
  return slug
    .replace(/-izle(?:-[0-9]+)?(?:-hd|-fullhd)?$/, '')
    .replace(/-hd$/, '')
    .replace(/-/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase());
}

function getCleanTitle(anime: { orijinal_ad: string | null; tranimeizle_slug: string }): string {
  if (!anime.orijinal_ad) {
    return formatSlug(anime.tranimeizle_slug);
  }
  const normTitle = anime.orijinal_ad.toLowerCase().replace(/[^a-z0-9]/g, '');
  const normSlug = anime.tranimeizle_slug.replace(/-izle(?:-[0-9]+)?(?:-hd|-fullhd)?$/, '').toLowerCase().replace(/[^a-z0-9]/g, '');
  if (normSlug !== normTitle) {
    return formatSlug(anime.tranimeizle_slug);
  }
  return anime.orijinal_ad;
}

function sortVariants(list: AnimeDetail[]): AnimeDetail[] {
  return [...list].sort((a, b) => {
    const getFormatPriority = (f: string | null) => {
      const format = (f || 'TV').toUpperCase();
      if (format === 'TV') return 1;
      if (format === 'MOVIE') return 2;
      if (format === 'OVA') return 3;
      if (format === 'SPECIAL') return 3;
      if (format === 'ONA') return 3;
      return 4;
    };
    const prioA = getFormatPriority(a.format);
    const prioB = getFormatPriority(b.format);
    if (prioA !== prioB) return prioA - prioB;
    const epsA = a.total_episodes || 0;
    const epsB = b.total_episodes || 0;
    if (epsA !== epsB) return epsB - epsA;
    return (a.tranimeizle_slug || '').localeCompare(b.tranimeizle_slug || '');
  });
}

interface AniListMeta {
  cover: string;
  score: string;
  description: string;
  bannerImage: string | null;
}

export default function AnimePage() {
  const { id } = useParams();
  const [anime, setAnime] = useState<AnimeDetail | null>(null);
  const [variants, setVariants] = useState<AnimeDetail[]>([]);
  const [activeAnime, setActiveAnime] = useState<AnimeDetail | null>(null);
  const [meta, setMeta] = useState<AniListMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const handleSelectVariant = async (v: AnimeDetail) => {
    if (activeAnime?._id === v._id) return;
    setActiveAnime(v);
    const cleanTitle = getCleanTitle(v);
    const aniListMeta = await fetchAniListDetails(v.anilist_id, cleanTitle, v.orijinal_ad);
    setMeta(aniListMeta);
  };

  useEffect(() => {
    if (!id) return;

    async function loadAnimeDetails() {
      try {
        const res = await fetch(`/api/proxy/animes/${id}`);
        if (!res.ok) {
          throw new Error('Anime bulunamadı veya sunucu hatası.');
        }
        const json = await res.json();
        if (json.success && json.data) {
          setAnime(json.data);
          
          let sorted: AnimeDetail[] = [];
          if (json.variants && Array.isArray(json.variants)) {
            sorted = sortVariants(json.variants);
          } else {
            sorted = [json.data];
          }
          setVariants(sorted);

          const defaultActive = sorted.find(v => v._id === json.data._id) || sorted[0] || json.data;
          setActiveAnime(defaultActive);
          
          // AniList verisini çek
          const cleanTitle = getCleanTitle(defaultActive);
          const aniListMeta = await fetchAniListDetails(defaultActive.anilist_id, cleanTitle, defaultActive.orijinal_ad);
          setMeta(aniListMeta);
        } else {
          setError('Anime bulunamadı.');
        }
      } catch (err: any) {
        console.error('Fetch error:', err);
        setError('Express API sunucusuna bağlanılamadı.');
      } finally {
        setLoading(false);
      }
    }

    loadAnimeDetails();
  }, [id]);

  async function fetchAniListDetails(anilistId: number | null, cleanTitle: string, orijinalAd: string | null): Promise<AniListMeta> {
    const fallback = {
      cover: 'https://images.unsplash.com/photo-1578632767115-351597cf2477?w=800&auto=format&fit=crop&q=80',
      score: 'N/A',
      description: 'Bu anime hakkında henüz detaylı açıklama bulunmuyor.',
      bannerImage: null
    };

    try {
      const normTitle = (orijinalAd || '').toLowerCase().replace(/[^a-z0-9]/g, '');
      const normClean = cleanTitle.toLowerCase().replace(/[^a-z0-9]/g, '');
      const isSpecific = normClean !== normTitle && normClean.length > normTitle.length;

      let query = '';
      let variables = {};

      if (isSpecific) {
        query = `
          query ($search: String) {
            Media (search: $search, type: ANIME) {
              coverImage {
                extraLarge
              }
              bannerImage
              averageScore
              description
            }
          }
        `;
        variables = { search: cleanTitle };
      } else {
        if (!anilistId) return fallback;
        query = `
          query ($id: Int) {
            Media (id: $id, type: ANIME) {
              coverImage {
                extraLarge
              }
              bannerImage
              averageScore
              description
            }
          }
        `;
        variables = { id: anilistId };
      }

      const response = await fetch('https://graphql.anilist.co', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({ query, variables })
      });
      const json = await response.json();
      if (json.data && json.data.Media) {
        const media = json.data.Media;
        return {
          cover: media.coverImage.extraLarge || fallback.cover,
          score: media.averageScore ? (media.averageScore / 10).toFixed(1) : 'N/A',
          description: media.description 
            ? media.description.replace(/<[^>]*>/g, '') 
            : fallback.description,
          bannerImage: media.bannerImage || null
        };
      }
    } catch (err) {
      console.error('AniList API error:', err);
    }
    return fallback;
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0a0a0c] text-[#f4f4f7] flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-[#ff6b00]/20 border-t-[#ff6b00] rounded-full animate-spin shadow-lg shadow-[#ff6b00]/20" />
      </div>
    );
  }

  if (error || !anime) {
    return (
      <div className="min-h-screen bg-[#0a0a0c] text-[#f4f4f7] flex flex-col items-center justify-center p-6 gap-4">
        <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-6 rounded-2xl text-center max-w-md flex flex-col items-center">
          <FaExclamationTriangle className="w-8 h-8 mb-2 opacity-80" />
          <p className="font-bold mb-2">Hata Oluştu</p>
          <p className="text-sm">{error || 'Anime bulunamadı.'}</p>
        </div>
        <Link href="/" className="px-6 py-2 bg-white/5 hover:bg-white/10 rounded-xl transition-all text-sm font-bold">
          Ana Sayfaya Dön
        </Link>
      </div>
    );
  }

  const activeTitle = activeAnime ? getCleanTitle(activeAnime) : 'Bilinmeyen Anime';
  const coverUrl = meta?.cover || 'https://images.unsplash.com/photo-1578632767115-351597cf2477?w=800&auto=format&fit=crop&q=80';
  const score = meta?.score || 'N/A';
  const description = meta?.description || 'Bu anime hakkında açıklama bulunmuyor.';
  const bannerImg = meta?.bannerImage;
  
  const episodes = activeAnime?.episodes || {};
  let epKeys = Object.keys(episodes).sort((a, b) => parseInt(a, 10) - parseInt(b, 10));
  
  if (epKeys.length === 0 && activeAnime?.tranimeizle_url) {
    epKeys = ['1'];
  }

  return (
    <div className="min-h-screen bg-[#0a0a0c] text-[#f4f4f7] font-sans antialiased selection:bg-[#ff6b00] selection:text-black">
      {/* Üst Menü */}
      <header className="sticky top-0 z-50 w-full px-6 py-4 bg-[#0a0a0c]/80 backdrop-blur-md border-b border-white/5">
        <div className="max-w-6xl mx-auto flex justify-between items-center">
          <Link href="/" className="flex items-center gap-3 group">
            <img src="/mainLogo.png" alt="Clofthel Logo" className="h-10 w-auto transition-transform group-hover:scale-105" />
            <span className="font-extrabold text-2xl tracking-tight bg-gradient-to-r from-[#ff6b00] to-[#ff8e3c] bg-clip-text text-transparent hidden sm:block">
              Clofthel
            </span>
          </Link>
          <div className="flex gap-4 items-center">
            <a href="/api/download-apk" download="Clofthel-v1.2.0.apk" className="px-5 py-2.5 bg-gradient-to-r from-[#ff6b00] to-[#ff8e3c] text-black font-black text-xs md:text-sm rounded-xl shadow-lg shadow-[#ff6b00]/20 hover:scale-105 active:scale-95 transition-all">
              ↓ Uygulamayı İndir
            </a>
          </div>
        </div>
      </header>

      {/* Banner Arka Plan */}
      {bannerImg && (
        <div className="absolute top-0 left-0 w-full h-[50vh] z-0 overflow-hidden opacity-30">
          <img src={bannerImg} alt="Banner" className="w-full h-full object-cover blur-sm" />
          <div className="absolute inset-0 bg-gradient-to-b from-transparent to-[#0a0a0c]" />
        </div>
      )}

      {/* Ana Detay Alanı */}
      <main className="relative z-10 max-w-6xl mx-auto px-6 py-12 flex flex-col gap-12 animate-fade-in mt-10 md:mt-20">
        
        {/* Üst Panel: Resim ve Temel Bilgiler */}
        <section className="relative flex flex-col md:flex-row gap-8 md:gap-12 bg-[#121217]/80 border border-white/5 rounded-3xl p-6 md:p-10 backdrop-blur-xl overflow-hidden shadow-2xl">
          <div className="absolute top-0 right-0 w-96 h-96 bg-[#ff6b00]/10 blur-[120px] rounded-full pointer-events-none" />
          
          <div className="flex-shrink-0 mx-auto md:mx-0 w-56 md:w-72 aspect-[5/7] rounded-2xl overflow-hidden border border-white/10 shadow-2xl group">
            <img src={coverUrl} alt={activeTitle} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" />
          </div>

          <div className="flex flex-col justify-center gap-4 md:gap-6 text-center md:text-left z-10">
            <div className="flex flex-wrap justify-center md:justify-start gap-3">
              <span className="bg-[#ff6b00]/10 border border-[#ff6b00]/25 px-3.5 py-1.5 rounded-xl text-xs font-bold text-[#ff6b00] uppercase tracking-wider">{activeAnime?.format || 'TV'}</span>
              <span className="bg-[#ff6b00]/10 border border-[#ff6b00]/25 px-3.5 py-1.5 rounded-xl text-xs font-bold text-[#ff6b00] uppercase tracking-wider flex items-center gap-1">
                <FaStar /> {score}
              </span>
            </div>
            <h1 className="text-4xl md:text-6xl font-black tracking-tight leading-tight drop-shadow-xl">{activeTitle}</h1>
            <p className="text-[#8e8e9f] text-sm md:text-base leading-relaxed max-w-2xl">{description}</p>
          </div>
        </section>

        {/* Uygulama İndirme CTA */}
        <section className="relative bg-gradient-to-r from-[#ff6b00] to-[#ff8e3c] rounded-3xl p-8 md:p-12 text-black shadow-2xl shadow-[#ff6b00]/20 overflow-hidden flex flex-col md:flex-row items-center justify-between gap-8 transform hover:scale-[1.01] transition-transform duration-500">
          <div className="absolute -right-20 -top-20 w-64 h-64 bg-white/20 blur-3xl rounded-full pointer-events-none" />
          <div className="absolute -left-20 -bottom-20 w-64 h-64 bg-black/10 blur-3xl rounded-full pointer-events-none" />
          
          <div className="flex flex-col gap-3 relative z-10 text-center md:text-left max-w-xl">
            <div className="inline-flex items-center justify-center md:justify-start gap-2 text-black/80 font-black text-xs uppercase tracking-widest mb-2">
              <span className="bg-black text-white px-2 py-1 rounded-md">AI Native 4K</span>
              <span>Reklamsız & Ücretsiz</span>
            </div>
            <h2 className="text-3xl md:text-4xl font-black drop-shadow-sm">Deneyimi Yükseltin</h2>
            <p className="text-black/80 font-bold text-sm md:text-base leading-relaxed">
              Bu animeyi web üzerinden izleyemezsiniz. Topluluk ve fansublar için geliştirdiğimiz Clofthel uygulaması ile reklamsız, donmadan ve <b>AI Native 4K</b> kalitesiyle izlemek ya da cihazınıza indirmek için hemen uygulamayı edinin.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-6 relative z-10 w-full md:w-auto mt-4 md:mt-0">
            <button disabled className="flex items-center justify-center gap-3 bg-black/10 text-black/50 px-8 py-4 rounded-2xl font-black cursor-not-allowed border border-black/10">
              <FaWindows className="w-6 h-6 opacity-50" />
              Windows (Yakında)
            </button>
            <a href="/api/download-apk" download="Clofthel-v1.2.0.apk" className="flex items-center justify-center gap-3 bg-white text-black px-8 py-4 rounded-2xl font-black hover:bg-white/90 active:scale-95 transition-all shadow-xl">
              <FaAndroid className="w-6 h-6 text-[#3DDC84]" />
              Android (APK) İndir
            </a>
          </div>
        </section>

        {/* Alternatif Sezonlar & Filmler Switcher */}
        {variants.length > 1 && (
          <section className="bg-white/[0.02] border border-white/5 rounded-3xl p-6 md:p-10 backdrop-blur-sm">
            <h2 className="text-xl md:text-2xl font-black mb-6 relative pb-2 after:content-[''] after:absolute after:bottom-0 after:left-0 after:w-8 after:h-0.5 after:bg-[#ff6b00] after:rounded-full">
              Sezonlar & Filmler ({variants.length})
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
              {variants.map((v) => {
                const vTitle = getCleanTitle(v);
                const isActive = activeAnime?._id === v._id;
                return (
                  <button
                    key={v._id}
                    onClick={() => handleSelectVariant(v)}
                    className={`p-4 rounded-2xl border text-left transition-all duration-300 ${
                      isActive 
                        ? 'bg-[#ff6b00]/10 border-[#ff6b00] text-white shadow-lg shadow-[#ff6b00]/10' 
                        : 'bg-white/[0.02] border-white/5 text-[#8e8e9f] hover:bg-white/[0.04] hover:border-white/10 hover:text-white'
                    }`}
                  >
                    <div className="flex justify-between items-start gap-2">
                      <span className="font-bold text-sm leading-snug line-clamp-2">
                        {vTitle}
                      </span>
                      <span className={`text-[10px] px-2 py-0.5 rounded font-black ${
                        v.format === 'MOVIE' 
                          ? 'bg-red-500/25 text-red-400 border border-red-500/25' 
                          : 'bg-blue-500/25 text-blue-400 border border-blue-500/25'
                      }`}>
                        {v.format || 'TV'}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </section>
        )}


      </main>

      {/* FOOTER */}
      <footer className="border-t border-white/5 bg-[#0a0a0c] pt-16 pb-8 text-center text-[#8e8e9f] mt-12">
        <div className="max-w-4xl mx-auto px-6 flex flex-col gap-6 items-center">
          <img src="/mainLogo.png" alt="Clofthel Logo" className="h-16 w-auto mb-2 transform hover:scale-110 transition-transform" />
          <p className="text-sm md:text-base font-medium leading-relaxed max-w-2xl">
            Biz bu platformu ticari kaygılarla değil, <span className="text-white font-bold">anime topluluğu</span> ve gece gündüz demeden emek veren <span className="text-white font-bold">değerli fansub grupları</span> için geliştirdik. 
            Amacımız, en saf, reklamsız ve kesintisiz anime deneyimini ücretsiz olarak sizlere sunmaktır. Çevirilerdeki tüm emek ilgili fansublara aittir.
          </p>
          <p className="text-xs font-bold mt-8 opacity-40 tracking-wider">
            © 2026 CLOFTHEL. BU WEB SİTESİ UYGULAMA İNDİRME VE İÇERİK KEŞFİ İÇİNDİR.
          </p>
        </div>
      </footer>
    </div>
  );
}

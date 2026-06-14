'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { FaAndroid, FaWindows, FaStar, FaExclamationTriangle } from 'react-icons/fa';

interface AniListAnime {
  id: number;
  title: { romaji: string; english: string | null; native: string | null };
  coverImage: { extraLarge: string; large: string };
  bannerImage: string | null;
  averageScore: number | null;
  episodes: number | null;
  format: string;
  status: string;
  genres: string[];
  description: string | null;
  startDate: { year: number | null };
  studios: { nodes: { name: string }[] };
}

const QUERY = `
  query ($id: Int) {
    Media(id: $id, type: ANIME) {
      id
      title { romaji english native }
      coverImage { extraLarge large }
      bannerImage
      averageScore
      episodes
      format
      status
      genres
      description(asHtml: false)
      startDate { year }
      studios(isMain: true) { nodes { name } }
    }
  }
`;

const FORMAT_LABEL: Record<string, string> = {
  TV: 'Dizi', MOVIE: 'Film', OVA: 'OVA', ONA: 'ONA', SPECIAL: 'Özel'
};

const STATUS_LABEL: Record<string, string> = {
  FINISHED: 'Tamamlandı', RELEASING: 'Devam Ediyor', NOT_YET_RELEASED: 'Yakında', CANCELLED: 'İptal'
};

export default function AniListDetailPage() {
  const { id } = useParams();
  const [anime, setAnime] = useState<AniListAnime | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    async function load() {
      try {
        const res = await fetch('https://graphql.anilist.co', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({ query: QUERY, variables: { id: Number(id) } }),
        });
        const json = await res.json();
        if (json?.data?.Media) setAnime(json.data.Media);
        else setError('Anime bulunamadı.');
      } catch {
        setError('AniList bağlantısı başarısız.');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [id]);

  if (loading) return (
    <div className="min-h-screen bg-[#0a0a0c] flex items-center justify-center">
      <div className="w-12 h-12 border-4 border-[#ff6b00]/20 border-t-[#ff6b00] rounded-full animate-spin" />
    </div>
  );

  if (error || !anime) return (
    <div className="min-h-screen bg-[#0a0a0c] text-[#f4f4f7] flex flex-col items-center justify-center gap-4 p-6">
      <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-6 rounded-2xl text-center max-w-md flex flex-col items-center">
        <FaExclamationTriangle className="w-8 h-8 mb-2 opacity-80" />
        <p className="font-bold mb-1">Hata</p>
        <p className="text-sm">{error || 'Anime bulunamadı.'}</p>
      </div>
      <Link href="/" className="px-6 py-2 bg-white/5 hover:bg-white/10 rounded-xl transition-all text-sm font-bold text-[#f4f4f7]">Ana Sayfaya Dön</Link>
    </div>
  );

  const title = anime.title.english || anime.title.romaji || anime.title.native || 'Bilinmeyen';
  const score = anime.averageScore ? (anime.averageScore / 10).toFixed(1) : 'N/A';
  const studio = anime.studios?.nodes?.[0]?.name;
  const description = anime.description?.replace(/<[^>]*>/g, '') || 'Bu anime hakkında açıklama bulunmuyor.';

  return (
    <div className="min-h-screen bg-[#0a0a0c] text-[#f4f4f7] font-sans antialiased selection:bg-[#ff6b00] selection:text-black">
      {/* Header */}
      <header className="sticky top-0 z-50 w-full px-6 py-4 bg-[#0a0a0c]/80 backdrop-blur-md border-b border-white/5">
        <div className="max-w-6xl mx-auto flex justify-between items-center">
          <Link href="/" className="flex items-center gap-3 group">
            <img src="/mainLogo.png" alt="Clofthel" className="h-10 w-auto group-hover:scale-105 transition-transform" />
            <span className="font-extrabold text-2xl tracking-tight bg-gradient-to-r from-[#ff6b00] to-[#ff8e3c] bg-clip-text text-transparent hidden sm:block">Clofthel</span>
          </Link>
          <a href="/api/download-apk" download="Clofthel-v1.2.0.apk" className="px-5 py-2.5 bg-gradient-to-r from-[#ff6b00] to-[#ff8e3c] text-black font-black text-xs md:text-sm rounded-xl shadow-lg shadow-[#ff6b00]/20 hover:scale-105 active:scale-95 transition-all">
            ↓ Uygulamayı İndir
          </a>
        </div>
      </header>

      {/* Banner */}
      {anime.bannerImage && (
        <div className="absolute top-0 left-0 w-full h-[50vh] z-0 overflow-hidden opacity-25">
          <img src={anime.bannerImage} alt="Banner" className="w-full h-full object-cover blur-sm" />
          <div className="absolute inset-0 bg-gradient-to-b from-transparent to-[#0a0a0c]" />
        </div>
      )}

      <main className="relative z-10 max-w-6xl mx-auto px-6 py-12 flex flex-col gap-12 mt-10 md:mt-20">

        {/* Üst Bilgi Paneli */}
        <section className="flex flex-col md:flex-row gap-8 md:gap-12 bg-[#121217]/80 border border-white/5 rounded-3xl p-6 md:p-10 backdrop-blur-xl shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 right-0 w-96 h-96 bg-[#ff6b00]/10 blur-[120px] rounded-full pointer-events-none" />

          <div className="flex-shrink-0 mx-auto md:mx-0 w-56 md:w-64 aspect-[5/7] rounded-2xl overflow-hidden border border-white/10 shadow-2xl">
            <img src={anime.coverImage.extraLarge || anime.coverImage.large} alt={title} className="w-full h-full object-cover" />
          </div>

          <div className="flex flex-col justify-center gap-4 text-center md:text-left z-10">
            <div className="flex flex-wrap justify-center md:justify-start gap-2">
              <span className="bg-[#ff6b00]/10 border border-[#ff6b00]/25 px-3 py-1 rounded-xl text-xs font-black text-[#ff6b00] uppercase tracking-wider">
                {FORMAT_LABEL[anime.format] || anime.format}
              </span>
              <span className="bg-[#ff6b00]/10 border border-[#ff6b00]/25 px-3 py-1 rounded-xl text-xs font-black text-[#ff6b00] uppercase tracking-wider flex items-center gap-1">
                <FaStar className="w-3 h-3" /> {score}
              </span>
              {anime.episodes && (
                <span className="bg-white/5 border border-white/10 px-3 py-1 rounded-xl text-xs font-black text-[#8e8e9f] uppercase tracking-wider">
                  {anime.episodes} Bölüm
                </span>
              )}
              <span className="bg-white/5 border border-white/10 px-3 py-1 rounded-xl text-xs font-black text-[#8e8e9f] uppercase tracking-wider">
                {STATUS_LABEL[anime.status] || anime.status}
              </span>
            </div>

            <h1 className="text-3xl md:text-5xl font-black tracking-tight leading-tight">{title}</h1>
            {anime.title.romaji && anime.title.english && (
              <p className="text-[#8e8e9f] text-sm font-medium">{anime.title.romaji}</p>
            )}

            <div className="flex flex-wrap gap-2 justify-center md:justify-start">
              {anime.genres.slice(0, 5).map(g => (
                <span key={g} className="text-[10px] font-black uppercase tracking-wider bg-white/5 border border-white/10 px-2.5 py-1 rounded-lg text-[#8e8e9f]">{g}</span>
              ))}
            </div>

            <p className="text-[#8e8e9f] text-sm leading-relaxed max-w-2xl line-clamp-4">{description}</p>

            {(studio || anime.startDate?.year) && (
              <p className="text-[#8e8e9f]/60 text-xs font-medium">
                {studio && <span>{studio}</span>}
                {studio && anime.startDate?.year && <span> · </span>}
                {anime.startDate?.year && <span>{anime.startDate.year}</span>}
              </p>
            )}
          </div>
        </section>

        {/* İndirme CTA */}
        <section className="relative bg-gradient-to-r from-[#ff6b00] to-[#ff8e3c] rounded-3xl p-8 md:p-12 text-black shadow-2xl shadow-[#ff6b00]/20 overflow-hidden flex flex-col md:flex-row items-center justify-between gap-8">
          <div className="absolute -right-20 -top-20 w-64 h-64 bg-white/20 blur-3xl rounded-full pointer-events-none" />
          <div className="absolute -left-20 -bottom-20 w-64 h-64 bg-black/10 blur-3xl rounded-full pointer-events-none" />
          <div className="flex flex-col gap-3 relative z-10 text-center md:text-left max-w-xl">
            <div className="inline-flex items-center justify-center md:justify-start gap-2 text-black/80 font-black text-xs uppercase tracking-widest mb-2">
              <span className="bg-black text-white px-2 py-1 rounded-md">AI Native 4K</span>
              <span>Reklamsız &amp; Ücretsiz</span>
            </div>
            <h2 className="text-3xl md:text-4xl font-black">{title} İzlemek İster Misin?</h2>
            <p className="text-black/80 font-bold text-sm md:text-base leading-relaxed">
              Bu animeyi reklamsız, donmadan ve <b>AI Native 4K</b> kalitesiyle izlemek ya da cihazına indirmek için Clofthel uygulamasını hemen edinebilirsin.
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-4 relative z-10 w-full md:w-auto">
            <button disabled className="flex items-center justify-center gap-3 bg-black/10 text-black/50 px-8 py-4 rounded-2xl font-black cursor-not-allowed border border-black/10">
              <FaWindows className="w-6 h-6 opacity-50" /> Windows (Yakında)
            </button>
            <a href="/api/download-apk" download="Clofthel-v1.2.0.apk" className="flex items-center justify-center gap-3 bg-white text-black px-8 py-4 rounded-2xl font-black hover:bg-white/90 active:scale-95 transition-all shadow-xl">
              <FaAndroid className="w-6 h-6 text-[#3DDC84]" /> Android (APK) İndir
            </a>
          </div>
        </section>

      </main>

      <footer className="border-t border-white/5 bg-[#0a0a0c] pt-12 pb-8 text-center text-[#8e8e9f] mt-12">
        <div className="max-w-4xl mx-auto px-6 flex flex-col gap-4 items-center">
          <img src="/mainLogo.png" alt="Clofthel" className="h-12 w-auto" />
          <div className="flex flex-wrap justify-center gap-5 text-xs text-[#8e8e9f]/60 font-medium">
            <Link href="/terms" className="hover:text-[#8e8e9f] transition-colors">Hizmet Şartları</Link>
            <span className="text-white/10">·</span>
            <Link href="/privacy" className="hover:text-[#8e8e9f] transition-colors">Gizlilik Politikası</Link>
            <span className="text-white/10">·</span>
            <Link href="/security" className="hover:text-[#8e8e9f] transition-colors">Güvenlik Politikası</Link>
          </div>
          <p className="text-xs font-bold opacity-30 tracking-wider mt-2">© 2026 CLOFTHEL</p>
        </div>
      </footer>
    </div>
  );
}

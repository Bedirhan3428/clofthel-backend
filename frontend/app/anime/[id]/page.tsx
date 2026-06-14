'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { FaWindows, FaAndroid, FaStar, FaExclamationTriangle, FaPlay, FaSpinner, FaTimes } from 'react-icons/fa';

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
  if (!anime.orijinal_ad) return formatSlug(anime.tranimeizle_slug);
  const normTitle = anime.orijinal_ad.toLowerCase().replace(/[^a-z0-9]/g, '');
  const normSlug = anime.tranimeizle_slug.replace(/-izle(?:-[0-9]+)?(?:-hd|-fullhd)?$/, '').toLowerCase().replace(/[^a-z0-9]/g, '');
  if (normSlug !== normTitle) return formatSlug(anime.tranimeizle_slug);
  return anime.orijinal_ad;
}

function sortVariants(list: AnimeDetail[]): AnimeDetail[] {
  return [...list].sort((a, b) => {
    const p = (f: string | null) => { const x = (f || 'TV').toUpperCase(); if (x === 'TV') return 1; if (x === 'MOVIE') return 2; return 3; };
    const pa = p(a.format), pb = p(b.format);
    if (pa !== pb) return pa - pb;
    return (b.total_episodes || 0) - (a.total_episodes || 0);
  });
}

interface AniListMeta { cover: string; score: string; description: string; bannerImage: string | null; }

type PlayerState = 'idle' | 'loading' | 'playing' | 'error';

export default function AnimePage() {
  const { id } = useParams();
  const [anime, setAnime] = useState<AnimeDetail | null>(null);
  const [variants, setVariants] = useState<AnimeDetail[]>([]);
  const [activeAnime, setActiveAnime] = useState<AnimeDetail | null>(null);
  const [meta, setMeta] = useState<AniListMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Player state
  const [playerState, setPlayerState] = useState<PlayerState>('idle');
  const [activeEp, setActiveEp] = useState<string | null>(null);
  const [playerError, setPlayerError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<any>(null);
  const playerSectionRef = useRef<HTMLDivElement>(null);

  const handleSelectVariant = async (v: AnimeDetail) => {
    if (activeAnime?._id === v._id) return;
    // Destroy player if switching variant
    destroyPlayer();
    setActiveEp(null);
    setPlayerState('idle');
    setActiveAnime(v);
    const cleanTitle = getCleanTitle(v);
    const m = await fetchAniListDetails(v.anilist_id, cleanTitle, v.orijinal_ad);
    setMeta(m);
  };

  useEffect(() => {
    if (!id) return;
    async function loadAnimeDetails() {
      try {
        const res = await fetch(`/api/proxy/animes/${id}`);
        if (!res.ok) throw new Error('Anime bulunamadı veya sunucu hatası.');
        const json = await res.json();
        if (json.success && json.data) {
          setAnime(json.data);
          let sorted: AnimeDetail[] = json.variants && Array.isArray(json.variants) ? sortVariants(json.variants) : [json.data];
          setVariants(sorted);
          const defaultActive = sorted.find(v => v._id === json.data._id) || sorted[0] || json.data;
          setActiveAnime(defaultActive);
          const cleanTitle = getCleanTitle(defaultActive);
          const m = await fetchAniListDetails(defaultActive.anilist_id, cleanTitle, defaultActive.orijinal_ad);
          setMeta(m);
        } else {
          setError('Anime bulunamadı.');
        }
      } catch (err: any) {
        setError('Sunucuya bağlanılamadı.');
      } finally {
        setLoading(false);
      }
    }
    loadAnimeDetails();
    return () => destroyPlayer();
  }, [id]);

  function destroyPlayer() {
    if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null; }
    if (videoRef.current) { videoRef.current.src = ''; }
  }

  async function handlePlayEpisode(epNum: string, episodeUrl: string) {
    if (activeEp === epNum && playerState === 'playing') return;
    setActiveEp(epNum);
    setPlayerState('loading');
    setPlayerError(null);

    // Scroll to player
    setTimeout(() => playerSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);

    try {
      // 1. resolve-source: get m3u8 URL
      const res = await fetch('/api/proxy/animes/resolve-source', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ episodeUrl }),
      });
      const json = await res.json();

      if (!json.success || !json.m3u8Url) {
        throw new Error(json.error || 'Video kaynağı çözümlenemedi.');
      }

      // 2. Wrap in stream.m3u8 proxy
      const proxiedM3u8 = `/api/proxy/animes/stream.m3u8?url=${encodeURIComponent(json.m3u8Url)}`;

      // 3. Load with hls.js
      destroyPlayer();
      const Hls = (await import('hls.js')).default;

      if (Hls.isSupported() && videoRef.current) {
        const hls = new Hls({ enableWorker: false, maxBufferLength: 30 });
        hlsRef.current = hls;
        hls.loadSource(proxiedM3u8);
        hls.attachMedia(videoRef.current);
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          videoRef.current?.play();
          setPlayerState('playing');
        });
        hls.on(Hls.Events.ERROR, (_: any, data: any) => {
          if (data.fatal) {
            setPlayerState('error');
            setPlayerError('Video yüklenirken bir hata oluştu. Lütfen tekrar deneyin.');
          }
        });
      } else if (videoRef.current?.canPlayType('application/vnd.apple.mpegurl')) {
        // Safari native HLS
        videoRef.current.src = proxiedM3u8;
        await videoRef.current.play();
        setPlayerState('playing');
      } else {
        throw new Error('Tarayıcınız HLS oynatmayı desteklemiyor.');
      }
    } catch (err: any) {
      setPlayerState('error');
      setPlayerError(err.message || 'Bilinmeyen hata.');
    }
  }

  async function fetchAniListDetails(anilistId: number | null, cleanTitle: string, orijinalAd: string | null): Promise<AniListMeta> {
    const fallback = { cover: 'https://images.unsplash.com/photo-1578632767115-351597cf2477?w=800&auto=format&fit=crop&q=80', score: 'N/A', description: 'Bu anime hakkında henüz detaylı açıklama bulunmuyor.', bannerImage: null };
    try {
      const query = anilistId
        ? `query ($id: Int) { Media (id: $id, type: ANIME) { coverImage { extraLarge } bannerImage averageScore description } }`
        : `query ($search: String) { Media (search: $search, type: ANIME) { coverImage { extraLarge } bannerImage averageScore description } }`;
      const variables = anilistId ? { id: anilistId } : { search: cleanTitle };
      const response = await fetch('https://graphql.anilist.co', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' }, body: JSON.stringify({ query, variables }) });
      const json = await response.json();
      if (json.data?.Media) {
        const media = json.data.Media;
        return { cover: media.coverImage?.extraLarge || fallback.cover, score: media.averageScore ? (media.averageScore / 10).toFixed(1) : 'N/A', description: media.description ? media.description.replace(/<[^>]*>/g, '') : fallback.description, bannerImage: media.bannerImage || null };
      }
    } catch { }
    return fallback;
  }

  if (loading) return <div className="min-h-screen bg-[#0a0a0c] text-[#f4f4f7] flex items-center justify-center"><div className="w-12 h-12 border-4 border-[#ff6b00]/20 border-t-[#ff6b00] rounded-full animate-spin" /></div>;

  if (error || !anime) return (
    <div className="min-h-screen bg-[#0a0a0c] text-[#f4f4f7] flex flex-col items-center justify-center p-6 gap-4">
      <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-6 rounded-2xl text-center max-w-md flex flex-col items-center">
        <FaExclamationTriangle className="w-8 h-8 mb-2 opacity-80" />
        <p className="font-bold mb-2">Hata Oluştu</p>
        <p className="text-sm">{error || 'Anime bulunamadı.'}</p>
      </div>
      <Link href="/" className="px-6 py-2 bg-white/5 hover:bg-white/10 rounded-xl transition-all text-sm font-bold">Ana Sayfaya Dön</Link>
    </div>
  );

  const activeTitle = activeAnime ? getCleanTitle(activeAnime) : 'Bilinmeyen Anime';
  const coverUrl = meta?.cover || 'https://images.unsplash.com/photo-1578632767115-351597cf2477?w=800&auto=format&fit=crop&q=80';
  const score = meta?.score || 'N/A';
  const description = meta?.description || 'Bu anime hakkında açıklama bulunmuyor.';
  const bannerImg = meta?.bannerImage;
  const episodes = activeAnime?.episodes || {};
  let epKeys = Object.keys(episodes).sort((a, b) => parseInt(a) - parseInt(b));
  if (epKeys.length === 0 && activeAnime?.tranimeizle_url) epKeys = ['1'];

  return (
    <div className="min-h-screen bg-[#0a0a0c] text-[#f4f4f7] font-sans antialiased selection:bg-[#ff6b00] selection:text-black">
      {/* Header */}
      <header className="sticky top-0 z-50 w-full px-6 py-4 bg-[#0a0a0c]/80 backdrop-blur-md border-b border-white/5">
        <div className="max-w-6xl mx-auto flex justify-between items-center">
          <Link href="/" className="flex items-center gap-3 group">
            <img src="/mainLogo.png" alt="Clofthel Logo" className="h-10 w-auto transition-transform group-hover:scale-105" />
            <span className="font-extrabold text-2xl tracking-tight bg-gradient-to-r from-[#ff6b00] to-[#ff8e3c] bg-clip-text text-transparent hidden sm:block">Clofthel</span>
          </Link>
          <a href="/api/download-apk" download="Clofthel-v1.2.0.apk" className="px-5 py-2.5 bg-gradient-to-r from-[#ff6b00] to-[#ff8e3c] text-black font-black text-xs md:text-sm rounded-xl shadow-lg shadow-[#ff6b00]/20 hover:scale-105 active:scale-95 transition-all">↓ Uygulamayı İndir</a>
        </div>
      </header>

      {bannerImg && (
        <div className="absolute top-0 left-0 w-full h-[50vh] z-0 overflow-hidden opacity-30">
          <img src={bannerImg} alt="Banner" className="w-full h-full object-cover blur-sm" />
          <div className="absolute inset-0 bg-gradient-to-b from-transparent to-[#0a0a0c]" />
        </div>
      )}

      <main className="relative z-10 max-w-6xl mx-auto px-6 py-12 flex flex-col gap-10 mt-10 md:mt-20">

        {/* Üst Panel */}
        <section className="relative flex flex-col md:flex-row gap-8 md:gap-12 bg-[#121217]/80 border border-white/5 rounded-3xl p-6 md:p-10 backdrop-blur-xl overflow-hidden shadow-2xl">
          <div className="absolute top-0 right-0 w-96 h-96 bg-[#ff6b00]/10 blur-[120px] rounded-full pointer-events-none" />
          <div className="flex-shrink-0 mx-auto md:mx-0 w-56 md:w-72 aspect-[5/7] rounded-2xl overflow-hidden border border-white/10 shadow-2xl">
            <img src={coverUrl} alt={activeTitle} className="w-full h-full object-cover" />
          </div>
          <div className="flex flex-col justify-center gap-4 text-center md:text-left z-10">
            <div className="flex flex-wrap justify-center md:justify-start gap-3">
              <span className="bg-[#ff6b00]/10 border border-[#ff6b00]/25 px-3.5 py-1.5 rounded-xl text-xs font-bold text-[#ff6b00] uppercase tracking-wider">{activeAnime?.format || 'TV'}</span>
              <span className="bg-[#ff6b00]/10 border border-[#ff6b00]/25 px-3.5 py-1.5 rounded-xl text-xs font-bold text-[#ff6b00] uppercase tracking-wider flex items-center gap-1"><FaStar /> {score}</span>
              {epKeys.length > 0 && <span className="bg-white/5 border border-white/10 px-3.5 py-1.5 rounded-xl text-xs font-bold text-[#8e8e9f] uppercase tracking-wider">{epKeys.length} Bölüm</span>}
            </div>
            <h1 className="text-4xl md:text-6xl font-black tracking-tight leading-tight">{activeTitle}</h1>
            <p className="text-[#8e8e9f] text-sm md:text-base leading-relaxed max-w-2xl line-clamp-4">{description}</p>
          </div>
        </section>

        {/* Video Player */}
        <section ref={playerSectionRef} className="bg-[#121217]/80 border border-white/5 rounded-3xl overflow-hidden shadow-2xl">
          <div className="relative bg-black aspect-video w-full">
            {playerState === 'idle' && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 text-[#8e8e9f]">
                <div className="w-20 h-20 rounded-full bg-white/5 border border-white/10 flex items-center justify-center">
                  <FaPlay className="w-8 h-8 text-[#ff6b00] ml-1" />
                </div>
                <p className="text-sm font-bold">Aşağıdan bir bölüm seçin</p>
              </div>
            )}
            {playerState === 'loading' && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-black/80">
                <FaSpinner className="w-10 h-10 text-[#ff6b00] animate-spin" />
                <p className="text-sm font-bold text-[#8e8e9f]">{activeEp ? `${activeEp}. Bölüm` : ''} yükleniyor...</p>
              </div>
            )}
            {playerState === 'error' && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-black/80 px-6 text-center">
                <FaExclamationTriangle className="w-10 h-10 text-red-400" />
                <p className="text-red-400 font-bold text-sm max-w-xs">{playerError}</p>
                <button onClick={() => { setPlayerState('idle'); setActiveEp(null); }} className="text-xs text-[#8e8e9f] hover:text-white underline flex items-center gap-1"><FaTimes /> Kapat</button>
              </div>
            )}
            <video ref={videoRef} className="w-full h-full" controls playsInline style={{ display: playerState === 'playing' ? 'block' : 'none' }} />
          </div>

          {/* Episode List */}
          <div className="p-6 md:p-8">
            <h2 className="text-xl font-black mb-5 flex items-center gap-2">
              Bölümler
              <span className="text-xs font-bold text-[#8e8e9f] bg-white/5 px-2 py-0.5 rounded-lg">{epKeys.length}</span>
            </h2>
            {epKeys.length > 0 ? (
              <div className="grid grid-cols-5 sm:grid-cols-8 md:grid-cols-10 lg:grid-cols-12 gap-2">
                {epKeys.map(epNum => {
                  const epUrl = episodes[epNum] || activeAnime?.tranimeizle_url || '';
                  const isActive = activeEp === epNum;
                  const isLoading = isActive && playerState === 'loading';
                  return (
                    <button
                      key={epNum}
                      onClick={() => handlePlayEpisode(epNum, epUrl)}
                      disabled={isLoading}
                      className={`relative aspect-square rounded-xl text-xs font-black transition-all duration-200 flex items-center justify-center border ${
                        isActive
                          ? 'bg-[#ff6b00] border-[#ff6b00] text-black shadow-lg shadow-[#ff6b00]/30 scale-105'
                          : 'bg-white/[0.04] border-white/10 text-[#8e8e9f] hover:bg-white/[0.08] hover:border-white/20 hover:text-white'
                      }`}
                    >
                      {isLoading ? <FaSpinner className="animate-spin text-black w-3 h-3" /> : epNum}
                    </button>
                  );
                })}
              </div>
            ) : (
              <p className="text-[#8e8e9f] text-sm">Bu anime için bölüm listesi bulunamadı.</p>
            )}
          </div>
        </section>

        {/* Sezon Switcher */}
        {variants.length > 1 && (
          <section className="bg-white/[0.02] border border-white/5 rounded-3xl p-6 md:p-8 backdrop-blur-sm">
            <h2 className="text-xl font-black mb-5">Sezonlar & Filmler ({variants.length})</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
              {variants.map((v) => {
                const vTitle = getCleanTitle(v);
                const isActive = activeAnime?._id === v._id;
                return (
                  <button key={v._id} onClick={() => handleSelectVariant(v)} className={`p-4 rounded-2xl border text-left transition-all ${isActive ? 'bg-[#ff6b00]/10 border-[#ff6b00] text-white' : 'bg-white/[0.02] border-white/5 text-[#8e8e9f] hover:bg-white/[0.05] hover:text-white'}`}>
                    <div className="flex justify-between items-start gap-2">
                      <span className="font-bold text-sm leading-snug line-clamp-2">{vTitle}</span>
                      <span className={`text-[10px] px-2 py-0.5 rounded font-black ${v.format === 'MOVIE' ? 'bg-red-500/25 text-red-400 border border-red-500/25' : 'bg-blue-500/25 text-blue-400 border border-blue-500/25'}`}>{v.format || 'TV'}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </section>
        )}

        {/* APK CTA */}
        <section className="relative bg-gradient-to-r from-[#ff6b00] to-[#ff8e3c] rounded-3xl p-8 md:p-12 text-black shadow-2xl shadow-[#ff6b00]/20 overflow-hidden flex flex-col md:flex-row items-center justify-between gap-8">
          <div className="absolute -right-20 -top-20 w-64 h-64 bg-white/20 blur-3xl rounded-full pointer-events-none" />
          <div className="absolute -left-20 -bottom-20 w-64 h-64 bg-black/10 blur-3xl rounded-full pointer-events-none" />
          <div className="flex flex-col gap-3 relative z-10 text-center md:text-left max-w-xl">
            <div className="inline-flex items-center justify-center md:justify-start gap-2 text-black/80 font-black text-xs uppercase tracking-widest mb-2">
              <span className="bg-black text-white px-2 py-1 rounded-md">AI Native 4K</span>
              <span>Reklamsız &amp; Ücretsiz</span>
            </div>
            <h2 className="text-3xl md:text-4xl font-black">Tam Deneyim için Uygulamayı Edinin</h2>
            <p className="text-black/80 font-bold text-sm md:text-base leading-relaxed">AI Native 4K, offline indirme, bildirimler ve çok daha fazlası için Clofthel uygulamasını edinin.</p>
          </div>
          <div className="flex flex-col sm:flex-row gap-4 relative z-10 w-full md:w-auto">
            <button disabled className="flex items-center justify-center gap-3 bg-black/10 text-black/50 px-8 py-4 rounded-2xl font-black cursor-not-allowed border border-black/10"><FaWindows className="w-6 h-6 opacity-50" /> Windows (Yakında)</button>
            <a href="/api/download-apk" download="Clofthel-v1.2.0.apk" className="flex items-center justify-center gap-3 bg-white text-black px-8 py-4 rounded-2xl font-black hover:bg-white/90 active:scale-95 transition-all shadow-xl"><FaAndroid className="w-6 h-6 text-[#3DDC84]" /> Android (APK) İndir</a>
          </div>
        </section>

      </main>

      <footer className="border-t border-white/5 bg-[#0a0a0c] pt-12 pb-8 text-center text-[#8e8e9f] mt-4">
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

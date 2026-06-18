'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { FaWindows, FaAndroid, FaStar, FaChevronDown, FaTimes, FaRocket, FaCheckCircle, FaGlobe, FaCaretRight, FaExclamationTriangle, FaInstagram, FaSearch, FaHeart, FaEdit, FaCheck, FaTrash } from 'react-icons/fa';

interface Anime {
  id: number;
  title: string;
  titleRomaji: string;
  cover: string;
  score: string;
  episodes: number | null;
  format: string;
  genres: string[];
}

interface Comment {
  _id: string;
  authorName: string;
  content: string;
  createdAt: string;
  likeCount: number;
  isEdited?: boolean;
  editedAt?: string;
  isMine?: boolean;
}

const PATCH_NOTES = [
  { version: "v1.3.0", date: "18 Haziran 2026", text: "Gelişmiş güvenlik önlemleri ve yeni yasal onay (EULA) altyapısı entegre edildi. Ana sayfa tür satırları doğrudan API'den yüklenerek zenginleştirildi, benzer sezonlar tekil olarak gruplandı. Oynatıcı hız ve görüntü netleştirme seçenekleri eklendi!" },
  { version: "v1.2.0", date: "14 Haziran 2026", text: "Özel tasarlanmış akıllı oynatıcı altyapısı sayesinde artık hiçbir video yarım kalmıyor. Pürüzsüz ve kesintisiz anime izleme deneyimi getirildi!" },
  { version: "v1.1.5", date: "02 Haziran 2026", text: "Arama optimizasyonları ve görsel iyileştirmeler yapıldı. AniList entegrasyonu sayesinde aradığınız animeleri en doğru afiş ve puanlarla bulabilirsiniz." },
  { version: "v1.0.0", date: "15 Mayıs 2026", text: "Clofthel tam sürüm yayında! Uygulama içi indirme yöneticisi eklendi, artık animeleri cihazınıza indirip internet olmadan da izleyebilirsiniz." }
];

function CommentsSection({ targetId }: { targetId: string }) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [authorName, setAuthorName] = useState('');
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [authorKey, setAuthorKey] = useState('');

  useEffect(() => {
    let key = localStorage.getItem('clofthel_user_key');
    if (!key) {
      key = 'key_' + Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
      localStorage.setItem('clofthel_user_key', key);
    }
    setAuthorKey(key);
    fetchComments(key);
  }, [targetId]);

  const fetchComments = async (key: string) => {
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'https://api.clofthel.com.tr';
      const res = await fetch(`${apiUrl}/api/comments/${targetId}?authorKey=${key}`);
      const data = await res.json();
      if (data.success) {
        setComments(data.comments);
      }
    } catch (err) {
      console.error("Yorumlar alınamadı:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!authorName.trim() || !content.trim()) return;
    setSubmitting(true);
    setError('');
    
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'https://api.clofthel.com.tr';
      const res = await fetch(`${apiUrl}/api/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetId, authorName, content, authorKey })
      });
      const data = await res.json();
      if (data.success) {
        // Yeni eklenen yorumun isMine durumunu anında true yap
        setComments([{ ...data.comment, isMine: true }, ...comments]);
        setAuthorName('');
        setContent('');
      } else {
        setError(data.error || 'Yorum gönderilemedi.');
      }
    } catch (err) {
      setError('Bağlantı hatası.');
    } finally {
      setSubmitting(false);
    }
  };

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');

  const handleLike = async (id: string) => {
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'https://api.clofthel.com.tr';
      const res = await fetch(`${apiUrl}/api/comments/${id}/like`, { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        setComments(comments.map(c => c._id === id ? { ...c, likeCount: data.likeCount } : c));
      } else {
        alert(data.error);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleEdit = async (id: string) => {
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'https://api.clofthel.com.tr';
      const res = await fetch(`${apiUrl}/api/comments/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: editContent, authorKey })
      });
      const data = await res.json();
      if (data.success) {
        setComments(comments.map(c => c._id === id ? { ...c, content: editContent, isEdited: true } : c));
        setEditingId(null);
      } else {
        alert(data.error);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm("Bu yorumu silmek istediğinize emin misiniz?")) return;
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'https://api.clofthel.com.tr';
      const res = await fetch(`${apiUrl}/api/comments/${id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ authorKey })
      });
      const data = await res.json();
      if (data.success) {
        setComments(comments.filter(c => c._id !== id));
      } else {
        alert(data.error);
      }
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="flex flex-col gap-10 w-full max-w-4xl mx-auto">
      {/* Yorum Ekleme Formu */}
      <form onSubmit={handleSubmit} className="bg-white/5 border border-white/10 p-6 md:p-8 rounded-3xl flex flex-col gap-4 shadow-xl z-20 relative">
        <h3 className="font-black text-xl md:text-2xl text-white mb-2">Bir Yorum veya İstek Bırak</h3>
        {error && <div className="text-red-400 text-sm bg-red-500/10 p-3 rounded-lg border border-red-500/20 font-bold">{error}</div>}
        <input 
          type="text" 
          placeholder="İsminiz" 
          value={authorName} 
          onChange={(e) => setAuthorName(e.target.value)}
          className="bg-black/50 border border-white/10 rounded-xl px-5 py-4 text-white outline-none focus:border-[#ff6b00]/50 transition-colors font-medium"
          required
        />
        <textarea 
          placeholder="Düşünceleriniz veya eklenmesini istediğiniz anime..." 
          value={content} 
          onChange={(e) => setContent(e.target.value)}
          className="bg-black/50 border border-white/10 rounded-xl px-5 py-4 text-white outline-none focus:border-[#ff6b00]/50 transition-colors min-h-[120px] resize-y font-medium"
          required
        />
        <div className="flex justify-end mt-2">
          <button 
            type="submit" 
            disabled={submitting}
            className="bg-[#ff6b00] hover:bg-[#ff8e3c] text-black font-black px-10 py-4 rounded-xl transition-transform active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 shadow-lg shadow-[#ff6b00]/20"
          >
            {submitting ? 'Gönderiliyor...' : 'Gönder'}
          </button>
        </div>
      </form>

      {/* Yorumlar Listesi */}
      <div className="flex flex-col gap-4">
        {loading ? (
          <div className="text-center py-10 text-[#8e8e9f] font-bold">Yorumlar yükleniyor...</div>
        ) : comments.length === 0 ? (
          <div className="text-center py-16 bg-white/[0.02] border border-white/5 rounded-3xl text-[#8e8e9f] font-medium">
            Henüz yorum yapılmamış. İlk yorumu sen yap!
          </div>
        ) : (
          <div className="columns-1 sm:columns-2 lg:columns-3 gap-6 max-h-[700px] overflow-y-auto pr-2 custom-scrollbar pb-10 pt-4">
            {comments.map((c, i) => {
              const rotation = i % 3 === 0 ? '-rotate-2' : i % 3 === 1 ? 'rotate-2' : 'rotate-1';
              const margin = i % 2 === 0 ? 'mt-2' : 'mt-8';
              return (
                <div key={c._id} className={`bg-[#121217] border border-white/10 p-5 rounded-2xl flex flex-col gap-3 transition-all hover:bg-[#1a1a20] break-inside-avoid mb-6 hover:scale-[1.03] shadow-lg ${rotation} ${margin}`}>
                  <div className="flex items-center justify-between">
                    <span className="font-black text-white text-base">{c.authorName}</span>
                    <span className="text-[10px] text-[#8e8e9f] font-bold bg-white/5 px-2 py-0.5 rounded-md">
                      {new Date(c.createdAt).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })}
                      {c.isEdited && ' (Düz)'}
                    </span>
                  </div>
                  
                  {editingId === c._id ? (
                    <div className="flex flex-col gap-2 mt-1">
                      <textarea 
                        className="w-full bg-black/50 border border-white/10 rounded-lg p-3 text-sm text-white outline-none focus:border-[#ff6b00]/50 min-h-[80px]"
                        value={editContent}
                        onChange={(e) => setEditContent(e.target.value)}
                      />
                      <div className="flex justify-end gap-2">
                        <button type="button" onClick={() => setEditingId(null)} className="text-xs text-[#8e8e9f] hover:text-white px-2 py-1">İptal</button>
                        <button type="button" onClick={() => handleEdit(c._id)} className="text-xs bg-[#ff6b00] text-black font-bold px-3 py-1 rounded flex items-center gap-1"><FaCheck/> Kaydet</button>
                      </div>
                    </div>
                  ) : (
                    <p className="text-[#8e8e9f] text-sm leading-relaxed whitespace-pre-wrap font-medium">{c.content}</p>
                  )}

                  <div className="flex items-center justify-end gap-3 mt-2 border-t border-white/5 pt-3">
                    {!editingId && c.isMine && (
                      <>
                        <button onClick={() => handleDelete(c._id)} className="text-[11px] text-red-400 hover:text-red-300 flex items-center gap-1 transition-colors px-2 py-1">
                          <FaTrash /> Sil
                        </button>
                        <button onClick={() => { setEditingId(c._id); setEditContent(c.content); }} className="text-[11px] text-[#8e8e9f] hover:text-white flex items-center gap-1 transition-colors px-2 py-1">
                          <FaEdit /> Düzenle
                        </button>
                      </>
                    )}
                    <button onClick={() => handleLike(c._id)} className="text-[11px] text-[#ff6b00] hover:text-[#ff8e3c] flex items-center gap-1 transition-colors font-bold bg-[#ff6b00]/10 hover:bg-[#ff6b00]/20 px-3 py-1.5 rounded-lg">
                      <FaHeart /> {c.likeCount || 0}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

export default function Home() {
  const [animes, setAnimes] = useState<Anime[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);

  async function loadPopularAnimes() {
    setLoading(true);
    setError(null);
    setIsSearching(false);
    try {
      const res = await fetch('/api/trending');
      if (!res.ok) throw new Error('AniList bağlantısı başarısız oldu.');
      const json = await res.json();
      if (json.success && Array.isArray(json.data)) {
        setAnimes(json.data);
      } else {
        setError('Veri formatı geçersiz.');
      }
    } catch (err: any) {
      console.error('Fetch error:', err);
      setError('Trend animeler yüklenemedi.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadPopularAnimes();
  }, []);


  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) {
      loadPopularAnimes();
      return;
    }
    setIsSearching(true);
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/proxy/animes/search?q=${encodeURIComponent(searchQuery)}`);
      if (!res.ok) throw new Error('Arama başarısız oldu.');
      const json = await res.json();
      if (json.success && Array.isArray(json.data)) {
        const mappedAnimes = json.data.map((item: any) => ({
          id: item.anilist_id || 0,
          _id: item._id,
          title: item.anime_title || 'Bilinmeyen',
          titleRomaji: item.anime_title || '',
          cover: item.cover_image || 'https://images.unsplash.com/photo-1578632767115-351597cf2477?w=500&auto=format&fit=crop&q=60',
          score: item.average_score ? (item.average_score / 10).toFixed(1) : 'N/A',
          episodes: item.total_episodes || null,
          format: item.format || 'TV',
          genres: item.genres || [],
        }));
        setAnimes(mappedAnimes as any);
      } else {
        setAnimes([]);
      }
    } catch (err) {
      console.error(err);
      setError('Arama sırasında bir hata oluştu.');
    } finally {
      setLoading(false);
    }
  };

  const clearSearch = () => {
    setSearchQuery('');
    loadPopularAnimes();
  };

  const scrollToApp = () => {
    const el = document.getElementById('download-section');
    el?.scrollIntoView({ behavior: 'smooth' });
  };

  const scrollToAnimes = () => {
    const el = document.getElementById('anime-database');
    el?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <div className="min-h-screen bg-[#0a0a0c] text-[#f4f4f7] font-sans antialiased selection:bg-[#ff6b00] selection:text-black">
      {/* HEADER */}
      <header className="fixed top-0 z-50 w-full px-6 py-4 bg-[#0a0a0c]/80 backdrop-blur-md border-b border-white/5">
        <div className="max-w-6xl mx-auto flex justify-between items-center">
          <Link href="/" className="flex items-center gap-3 group">
            <img src="/mainLogo.png" alt="Clofthel Logo" className="h-10 w-auto transition-transform group-hover:scale-105" />
            <span className="font-extrabold text-2xl tracking-tight bg-gradient-to-r from-[#ff6b00] to-[#ff8e3c] bg-clip-text text-transparent hidden sm:block">
              Clofthel
            </span>
          </Link>
          <div className="flex gap-4 items-center">
            <button onClick={scrollToAnimes} className="text-sm font-bold text-[#8e8e9f] hover:text-white transition-colors hidden md:block">
              Anime Arşivi
            </button>
            <button onClick={scrollToApp} className="px-5 py-2.5 bg-gradient-to-r from-[#ff6b00] to-[#ff8e3c] text-black font-black text-sm rounded-xl shadow-lg shadow-[#ff6b00]/20 hover:scale-105 active:scale-95 transition-all">
              Hemen İndir
            </button>
          </div>
        </div>
      </header>

      <main className="flex flex-col gap-0">
        
        {/* HERO SECTION */}
        <section className="relative min-h-[90vh] flex flex-col items-center justify-center px-6 pt-20 overflow-hidden">
          {/* Background Effects */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[80vw] h-[80vw] max-w-[800px] max-h-[800px] bg-[#ff6b00]/15 blur-[120px] rounded-full pointer-events-none" />
          <div className="absolute top-0 w-full h-full bg-[url('https://images.unsplash.com/photo-1618336753974-aae8e04506aa?q=80&w=2070&auto=format&fit=crop')] opacity-[0.03] bg-cover bg-center pointer-events-none mix-blend-screen" />

          <div className="relative z-10 max-w-4xl mx-auto text-center flex flex-col items-center gap-8 animate-fade-in mt-10">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[#ff6b00]/10 border border-[#ff6b00]/20 text-[#ff6b00] font-bold text-xs uppercase tracking-widest mb-4">
              <span className="w-2 h-2 rounded-full bg-[#ff6b00] animate-pulse" />
              Sürüm 1.3.0 Yayında
            </div>
            
            <div className="inline-flex items-center justify-center gap-2 text-[#8e8e9f] font-black text-xs uppercase tracking-widest mb-6 border border-white/10 bg-white/5 px-4 py-2 rounded-full">
              <FaRocket className="text-[#ff6b00]" />
              <span>AI Native 4K • Reklamsız • Tamamen Ücretsiz</span>
            </div>

            <h1 className="text-5xl md:text-7xl lg:text-8xl font-black tracking-tighter leading-[1.1] drop-shadow-2xl">
              Anime İzlemenin <br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#ff6b00] via-[#ff8e3c] to-[#ffc837]">
                En Saf Hali
              </span>
            </h1>
            
            <p className="text-[#8e8e9f] text-lg md:text-xl max-w-2xl font-medium leading-relaxed mt-6">
              Binlerce animeyi <span className="text-white font-bold">AI Native 4K</span> kalitesinde, tamamen reklamsız ve kesintisiz izleyin. Tarayıcı limitlerine takılmadan, doğrudan bilgisayarınızda veya telefonunuzda pürüzsüz bir deneyim yaşayın.
            </p>

            <div id="download-section" className="flex flex-col sm:flex-row items-center gap-6 mt-10 mb-16 w-full justify-center">
              <a 
                href="/api/download-apk?type=android" 
                download="Clofthel-v1.3.0-arm64.apk"
                className="flex items-center justify-center gap-3 bg-[#1e1e24] border border-white/10 text-white px-8 py-5 rounded-2xl font-black hover:bg-[#2a2a32] hover:scale-105 active:scale-95 transition-all shadow-xl w-full sm:w-auto text-lg group"
              >
                <FaAndroid className="w-7 h-7 text-[#3DDC84] transition-transform group-hover:-translate-y-1" />
                Android İndir (ARM64)
              </a>
              <a 
                href="/api/download-apk?type=emulator" 
                download="Clofthel-v1.3.0-x86_64.apk"
                className="flex items-center justify-center gap-3 bg-[#1e1e24] border border-[#ff6b00]/30 text-white px-8 py-5 rounded-2xl font-black hover:bg-[#2a2a32] hover:scale-105 active:scale-95 transition-all shadow-xl w-full sm:w-auto text-lg group"
              >
                <FaAndroid className="w-7 h-7 text-[#ff6b00] transition-transform group-hover:-translate-y-1" />
                Emülatör İndir (x86_64)
              </a>
              <button disabled className="flex items-center justify-center gap-3 bg-white/5 text-[#8e8e9f] px-8 py-5 rounded-2xl font-black w-full sm:w-auto text-lg cursor-not-allowed border border-white/10">
                <FaWindows className="w-7 h-7 opacity-50" />
                Windows (Yakında)
              </button>
            </div>
          </div>

          <div className="absolute bottom-10 animate-bounce cursor-pointer opacity-50 hover:opacity-100 transition-opacity" onClick={scrollToAnimes}>
            <FaChevronDown className="w-8 h-8 text-white" />
          </div>
        </section>

        {/* FEATURES & PATCH NOTES */}
        <section className="bg-[#121217] py-24 px-6 border-y border-white/5 relative z-10">
          <div className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-16">
            
            {/* Features */}
            <div className="flex flex-col gap-8">
              <h2 className="text-3xl md:text-4xl font-black">Neden Clofthel?</h2>
              <div className="flex flex-col gap-6">
                <div className="flex gap-4">
                  <div className="w-12 h-12 rounded-xl bg-[#ff6b00]/10 flex items-center justify-center flex-shrink-0 text-[#ff6b00]">
                    <FaRocket className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="font-bold text-lg mb-1">Mükemmel Hız ve Akıcılık</h3>
                    <p className="text-[#8e8e9f] text-sm leading-relaxed">Özel oynatıcı motorumuzla kesintisiz bir deneyim yaşıyorsunuz. Tıkanma, 5. saniyede durma veya donma derdi yok.</p>
                  </div>
                </div>
                <div className="flex gap-4">
                  <div className="w-12 h-12 rounded-xl bg-[#ff6b00]/10 flex items-center justify-center flex-shrink-0 text-[#ff6b00]">
                    <FaCheckCircle className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="font-bold text-lg mb-1">Cihaza İndirme Özelliği</h3>
                    <p className="text-[#8e8e9f] text-sm leading-relaxed">Bölümleri doğrudan yüksek hızda bilgisayarınıza veya telefonunuza indirip internetsiz ortamlarda da izleyebilirsiniz.</p>
                  </div>
                </div>
                <div className="flex gap-4">
                  <div className="w-12 h-12 rounded-xl bg-[#ff6b00]/10 flex items-center justify-center flex-shrink-0 text-[#ff6b00]">
                    <FaSearch className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="font-bold text-lg mb-1">Gelişmiş Arama Sistemi</h3>
                    <p className="text-[#8e8e9f] text-sm leading-relaxed">Güçlü algoritmamız sayesinde binlerce anime arasında saniyeler içinde aradığınızı bulun, AniList senkronizasyonu ile en detaylı bilgilere erişin.</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Patch Notes */}
            <div className="flex flex-col gap-8 bg-white/[0.02] border border-white/5 p-8 rounded-3xl">
              <h2 className="text-2xl font-black flex items-center gap-3">
                <FaCaretRight className="w-6 h-6 text-[#ff6b00]" />
                Yama Notları
              </h2>
              <div className="flex flex-col gap-6">
                {PATCH_NOTES.map((note, idx) => (
                  <div key={idx} className="relative pl-6 border-l border-white/10 before:absolute before:left-[-5px] before:top-1.5 before:w-2.5 before:h-2.5 before:rounded-full before:bg-[#ff6b00]">
                    <div className="flex items-center gap-3 mb-1">
                      <span className="font-black text-white">{note.version}</span>
                      <span className="text-xs text-[#8e8e9f] font-bold">{note.date}</span>
                    </div>
                    <p className="text-sm text-[#8e8e9f] leading-relaxed">{note.text}</p>
                  </div>
                ))}
              </div>
            </div>

          </div>
        </section>

        {/* ANIME DATABASE SECTION */}
        <section id="anime-database" className="py-24 px-6 relative z-10 min-h-screen">
          <div className="max-w-6xl mx-auto flex flex-col gap-10">
            <div className="flex flex-col md:flex-row justify-between items-end gap-6 border-b border-white/10 pb-6">
              <div>
                <h2 className="text-3xl md:text-5xl font-black mb-2">{isSearching ? 'Arama Sonuçları' : 'Katalog'}</h2>
                <p className="text-[#8e8e9f] text-sm">Geniş anime arşivimizi web üzerinden keşfedin, izlemek için uygulamayı kullanın.</p>
              </div>
              
              <form onSubmit={handleSearch} className="w-full md:w-96 relative group">
                <input
                  type="text"
                  placeholder="Anime Ara..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-[#16161c] border border-white/10 text-white rounded-2xl px-6 py-4 outline-none focus:border-[#ff6b00] focus:ring-1 focus:ring-[#ff6b00] transition-all"
                />
                <button
                  type="submit"
                  className="absolute right-2 top-2 bottom-2 bg-gradient-to-r from-[#ff6b00] to-[#ff8e3c] text-black px-6 rounded-xl font-bold hover:scale-105 active:scale-95 transition-transform"
                >
                  Ara
                </button>
              </form>
            </div>

            {isSearching && (
              <div className="flex justify-between items-center bg-[#16161c] px-6 py-4 rounded-xl border border-white/5">
                <p className="text-sm">"<span className="text-[#ff6b00] font-bold">{searchQuery}</span>" için sonuçlar listeleniyor.</p>
                <button onClick={clearSearch} className="text-xs font-bold text-[#8e8e9f] hover:text-white transition-colors flex items-center gap-1">
                  <FaTimes /> Aramayı Temizle
                </button>
              </div>
            )}

            {error && (
              <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-6 rounded-2xl text-center flex flex-col items-center">
                <FaExclamationTriangle className="w-8 h-8 mb-2 opacity-80" />
                <p className="font-bold mb-2">Hata Oluştu</p>
                <p className="text-sm">{error}</p>
              </div>
            )}

            {loading ? (
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4 md:gap-6">
                {[...Array(10)].map((_, i) => (
                  <div key={i} className="aspect-[5/7] bg-white/5 animate-pulse rounded-2xl border border-white/5" />
                ))}
              </div>
            ) : animes.length > 0 ? (
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4 md:gap-6">
                {animes.map((anime) => (
                  <Link
                    key={anime.id}
                    href={isSearching ? `/anime/${(anime as any)._id}` : `/anime/al/${anime.id}`}
                    className="group flex flex-col gap-3 relative"
                  >
                    <div className="aspect-[5/7] rounded-2xl overflow-hidden bg-black relative border border-white/5 group-hover:border-[#ff6b00]/50 transition-colors shadow-xl">
                      <img
                        src={anime.cover || 'https://images.unsplash.com/photo-1578632767115-351597cf2477?w=500&auto=format&fit=crop&q=60'}
                        alt={anime.title}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/0 opacity-0 group-hover:opacity-100 transition-opacity flex items-end justify-center pb-6">
                        <span className="bg-[#ff6b00] text-black font-black text-xs px-4 py-2 rounded-full transform translate-y-4 group-hover:translate-y-0 transition-transform">İncele</span>
                      </div>
                      <div className="absolute top-2 right-2 bg-black/60 backdrop-blur-md px-2 py-1 rounded-lg text-xs font-bold border border-white/10 flex items-center gap-1">
                        <FaStar className="text-[#ff6b00]" /> {anime.score}
                      </div>
                    </div>
                    <div className="flex flex-col px-1">
                      <h3 className="font-bold text-sm line-clamp-2 leading-tight group-hover:text-[#ff6b00] transition-colors" title={anime.title}>
                        {anime.title}
                      </h3>
                      <div className="flex justify-between items-center mt-1">
                        <span className="text-xs text-[#8e8e9f] font-medium">{anime.format || 'TV'}</span>
                        <span className="text-xs text-[#8e8e9f] font-medium">{anime.episodes ? `${anime.episodes} Bölüm` : '? Bölüm'}</span>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="text-center py-20 bg-white/5 rounded-3xl border border-white/5">
                <p className="text-[#8e8e9f] text-lg">Hiçbir anime bulunamadı.</p>
              </div>
            )}
          </div>
        </section>

        {/* ISTEK LISTESI VE YORUMLAR (DISQUS) */}
        <section className="py-24 px-6 relative z-10 border-t border-white/5 bg-[#0a0a0c]">
          <div className="max-w-4xl mx-auto flex flex-col gap-8">
            <div className="text-center">
              <h2 className="text-3xl md:text-5xl font-black mb-4 tracking-tight">İstek Listesi & <span className="text-[#ff6b00]">Değerlendirmeler</span></h2>
              <p className="text-[#8e8e9f] text-sm md:text-base leading-relaxed">
                Platform hakkındaki düşüncelerini, eklenmesini istediğin animeleri veya genel tavsiyelerini aşağıdan toplulukla paylaşabilirsin.
              </p>
            </div>
            
            <div className="w-full">
              <CommentsSection targetId="homepage" />
            </div>
          </div>
        </section>

        {/* FANSUBS SECTION */}
        <section className="py-24 px-6 bg-gradient-to-b from-[#0a0a0c] to-[#121217] relative z-10 border-t border-white/5">
          <div className="max-w-6xl mx-auto flex flex-col items-center gap-12">
            <div className="text-center max-w-4xl">
              <h2 className="text-4xl md:text-6xl font-black mb-6 tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-[#ff6b00] to-[#ffc837]">Gerçek Kahramanlar</h2>
              <p className="text-[#8e8e9f] text-lg md:text-xl font-medium leading-relaxed">
                Bu eşsiz deneyimi biz değil, gece gündüz demeden anadilimizde anime izlememizi sağlayan, muazzam çeviriler ve dizgiler yapan büyük kahramanlarımız var etti. Anime topluluğunun bel kemiği olan değerli fansub ekiplerine sonsuz teşekkürler!
              </p>
            </div>
            
            <div className="flex flex-wrap justify-center gap-4 w-full">
              {[
                { name: 'Seisubs / Seicode', color: 'from-white to-[#a1a1aa]' },
                { name: 'TrAnimeİzle', color: 'from-[#d4d4d8] to-[#71717a]' },
                { name: 'TAÇE', color: 'from-[#fcd34d] to-[#d97706]' },
                { name: 'Akatsuki Fansub', color: 'from-white to-[#8e8e9f]' },
                { name: 'Tempest Fansub', color: 'from-[#e4e4e7] to-[#a1a1aa]' },
                { name: 'PuzzleSub', color: 'from-[#ff8e3c] to-[#ff6b00]' },
                { name: 'Anisekai Fansub', color: 'from-[#f4f4f5] to-[#d4d4d8]' },
                { name: 'Aoi Fansub', color: 'from-[#d1d5db] to-[#6b7280]' }
              ].map((sub, idx) => (
                <div 
                  key={idx}
                  className="bg-[#121217] border border-white/10 rounded-2xl px-6 py-4 flex flex-col items-center justify-center transition-all hover:scale-110 hover:-translate-y-1 shadow-lg hover:shadow-[#ff6b00]/20 cursor-default"
                >
                  <h3 className={`font-black text-xl md:text-2xl text-transparent bg-clip-text bg-gradient-to-r ${sub.color}`}>
                    {sub.name}
                  </h3>
                </div>
              ))}
            </div>
          </div>
        </section>

      </main>
      
      {/* FOOTER */}
      <footer className="border-t border-white/5 bg-[#0a0a0c] pt-16 pb-8 text-center text-[#8e8e9f]">
        <div className="max-w-4xl mx-auto px-6 flex flex-col gap-6 items-center">
          <img src="/mainLogo.png" alt="Clofthel Logo" className="h-16 w-auto mb-2 transform hover:scale-110 transition-transform" />
          <p className="text-sm md:text-base font-medium leading-relaxed max-w-2xl">
            Biz bu platformu ticari kaygılarla değil, <span className="text-white font-bold">anime topluluğu</span> ve gece gündüz demeden emek veren <span className="text-white font-bold">değerli fansub grupları</span> için geliştirdik. 
            Amacımız, en saf, reklamsız ve kesintisiz anime deneyimini ücretsiz olarak sizlere sunmaktır. Çevirilerdeki tüm emek ilgili fansublara aittir.
          </p>
          <div className="flex flex-wrap justify-center gap-6 text-xs text-[#8e8e9f]/60 mt-6 font-medium">
            <Link href="/terms" className="hover:text-[#8e8e9f] transition-colors">Hizmet Şartları</Link>
            <span className="text-white/10">·</span>
            <Link href="/privacy" className="hover:text-[#8e8e9f] transition-colors">Gizlilik Politikası</Link>
            <span className="text-white/10">·</span>
            <Link href="/security" className="hover:text-[#8e8e9f] transition-colors">Güvenlik Politikası</Link>
          </div>
          <p className="text-xs font-bold mt-4 opacity-40 tracking-wider">
            © 2026 CLOFTHEL. BU WEB SİTESİ UYGULAMA İNDİRME VE İÇERİK KEŞFİ İÇİNDİR.
          </p>
        </div>
      </footer>
    </div>
  );
}

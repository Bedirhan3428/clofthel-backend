import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  FlatList,
  Image,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Keyboard
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS, SPACING, FONT_SIZES, FONT_WEIGHTS, BORDER_RADIUS, SHADOWS } from '../constants/theme';
import { getAiRecommendations } from '../services/api';
import { useAlert } from '../context/AlertContext';

export default function AiRecommendationScreen({ navigation }) {
  const [prompt, setPrompt] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [results, setResults] = useState([]);
  const [hasSearched, setHasSearched] = useState(false);
  
  const { showAlert } = useAlert();

  const handleRecommend = async (customPrompt = prompt) => {
    if (!customPrompt.trim()) return;
    
    Keyboard.dismiss();
    setIsLoading(true);
    setHasSearched(true);
    setResults([]);

    const res = await getAiRecommendations(customPrompt);
    setIsLoading(false);

    if (res && res.success) {
      setResults(res.data || []);
      if (res.data.length === 0) {
        showAlert('Sonuç Yok', 'İsteğinize uygun bir anime veritabanımızda bulunamadı.');
      }
    } else {
      showAlert('Hata', res?.error || 'Öneriler alınamadı.');
    }
  };

  const quickPrompts = [
    "Karanlık fantastik ve kılıç dövüşü",
    "Komik ve romantik lise animesi",
    "Gözyaşlarına boğacak dram",
    "Efsanevi dövüş sahneleri olan shounen"
  ];

  const renderAnimeCard = ({ item }) => (
    <TouchableOpacity 
      style={styles.card}
      activeOpacity={0.8}
      onPress={() => navigation.navigate('AnimeDetail', { anime: item })}
    >
      <Image source={{ uri: item.coverImage?.large || item.cover_image }} style={styles.coverImage} />
      <View style={styles.cardInfo}>
        <Text style={styles.animeTitle} numberOfLines={2}>
          {item.title?.romaji || item.title || item.anime_title || item.orijinal_ad || "Bilinmeyen Anime"}
        </Text>
        <Text style={styles.animeMeta} numberOfLines={1}>
          {item.genres?.join(', ')}
        </Text>
        <View style={styles.scoreBadge}>
          <Ionicons name="star" size={12} color={COLORS.accent} />
          <Text style={styles.scoreText}>{item.averageScore || '?'}</Text>
        </View>
      </View>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Ionicons name="chevron-back" size={28} color="#FFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>AI Asistanı</Text>
        <View style={{ width: 40 }} />
      </View>

      <KeyboardAvoidingView 
        style={{ flex: 1 }} 
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <FlatList
          data={results}
          keyExtractor={(item) => item._id}
          numColumns={2}
          contentContainerStyle={styles.listContainer}
          renderItem={renderAnimeCard}
          ListEmptyComponent={() => (
            <View style={styles.emptyState}>
              {isLoading ? (
                <View style={styles.loadingBox}>
                  <ActivityIndicator size="large" color={COLORS.accent} />
                  <Text style={styles.loadingText}>Yapay zeka animeleri seçiyor...</Text>
                </View>
              ) : hasSearched ? (
                <Text style={styles.emptyText}>Maalesef uygun anime bulunamadı.</Text>
              ) : (
                <View style={styles.welcomeBox}>
                  <View style={styles.iconGlow}>
                    <Ionicons name="sparkles" size={40} color={COLORS.accent} />
                  </View>
                  <Text style={styles.welcomeTitle}>Nasıl bir anime arıyorsun?</Text>
                  <Text style={styles.welcomeSubtitle}>Ruh halini, sevdiğin türleri veya aradığın temayı yaz. Llama 3 (Groq AI) sana en uygun animeleri bulsun!</Text>

                  <View style={styles.quickPrompts}>
                    {quickPrompts.map((q, idx) => (
                      <TouchableOpacity 
                        key={idx} 
                        style={styles.quickPromptChip}
                        onPress={() => {
                          setPrompt(q);
                          handleRecommend(q);
                        }}
                      >
                        <Text style={styles.quickPromptText}>{q}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              )}
            </View>
          )}
        />

        {/* Input Area */}
        <View style={styles.inputContainer}>
          <TextInput
            style={styles.input}
            placeholder="Ne izlemek istersin? (Örn: Sihir ve Komedi...)"
            placeholderTextColor={COLORS.textMuted}
            value={prompt}
            onChangeText={setPrompt}
            multiline
            maxLength={200}
          />
          <TouchableOpacity 
            style={[styles.sendButton, !prompt.trim() && { opacity: 0.5 }]} 
            onPress={() => handleRecommend()}
            disabled={!prompt.trim() || isLoading}
          >
            <LinearGradient
              colors={[COLORS.accent, COLORS.accentDark]}
              style={styles.sendGradient}
            >
              <Ionicons name="send" size={20} color="#FFF" />
            </LinearGradient>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.bgPrimary,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'flex-start',
  },
  headerTitle: {
    color: '#FFF',
    fontSize: FONT_SIZES.title,
    fontWeight: FONT_WEIGHTS.bold,
  },
  listContainer: {
    padding: SPACING.sm,
    flexGrow: 1,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 40,
  },
  welcomeBox: {
    alignItems: 'center',
    paddingHorizontal: SPACING.xl,
  },
  iconGlow: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: COLORS.accentGlowSubtle,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: SPACING.lg,
    borderWidth: 1,
    borderColor: COLORS.borderAccent,
  },
  welcomeTitle: {
    color: '#FFF',
    fontSize: FONT_SIZES.heading,
    fontWeight: FONT_WEIGHTS.bold,
    textAlign: 'center',
    marginBottom: SPACING.sm,
  },
  welcomeSubtitle: {
    color: COLORS.textSecondary,
    fontSize: FONT_SIZES.body,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: SPACING.xxl,
  },
  quickPrompts: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 10,
  },
  quickPromptChip: {
    backgroundColor: COLORS.bgElevated,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
    borderRadius: BORDER_RADIUS.pill,
    borderWidth: 1,
    borderColor: COLORS.divider,
  },
  quickPromptText: {
    color: COLORS.accent,
    fontSize: FONT_SIZES.caption,
    fontWeight: FONT_WEIGHTS.medium,
  },
  loadingBox: {
    alignItems: 'center',
    marginTop: 60,
  },
  loadingText: {
    color: COLORS.accent,
    marginTop: SPACING.md,
    fontSize: FONT_SIZES.body,
    fontWeight: FONT_WEIGHTS.bold,
  },
  emptyText: {
    color: COLORS.textSecondary,
    marginTop: 40,
    fontSize: FONT_SIZES.body,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: SPACING.md,
    backgroundColor: COLORS.bgSecondary,
    borderTopWidth: 1,
    borderTopColor: COLORS.divider,
  },
  input: {
    flex: 1,
    backgroundColor: COLORS.bgElevated,
    color: '#FFF',
    borderRadius: BORDER_RADIUS.lg,
    paddingHorizontal: SPACING.lg,
    paddingTop: 14,
    paddingBottom: 14,
    fontSize: FONT_SIZES.body,
    minHeight: 50,
    maxHeight: 120,
    borderWidth: 1,
    borderColor: COLORS.divider,
  },
  sendButton: {
    marginLeft: SPACING.md,
    width: 50,
    height: 50,
    borderRadius: 25,
    overflow: 'hidden',
    ...SHADOWS.glow,
  },
  sendGradient: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingLeft: 4,
  },
  card: {
    flex: 1,
    margin: SPACING.sm,
    backgroundColor: COLORS.bgElevated,
    borderRadius: BORDER_RADIUS.md,
    overflow: 'hidden',
    maxWidth: '46%',
  },
  coverImage: {
    width: '100%',
    height: 180,
    backgroundColor: COLORS.bgSecondary,
  },
  cardInfo: {
    padding: SPACING.sm,
  },
  animeTitle: {
    color: '#FFF',
    fontSize: FONT_SIZES.caption,
    fontWeight: FONT_WEIGHTS.bold,
    marginBottom: 4,
  },
  animeMeta: {
    color: COLORS.textSecondary,
    fontSize: FONT_SIZES.caption - 2,
    marginBottom: 6,
  },
  scoreBadge: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  scoreText: {
    color: COLORS.textPrimary,
    fontSize: FONT_SIZES.caption - 2,
    fontWeight: FONT_WEIGHTS.bold,
    marginLeft: 4,
  }
});

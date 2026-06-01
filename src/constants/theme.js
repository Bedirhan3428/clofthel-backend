/**
 * Clofthel — Premium Dark Theme Configuration
 * All color tokens, spacing, typography, and shadow definitions live here.
 */

export const COLORS = {
  // ── Backgrounds ──────────────────────────────────────────
  bgPrimary: '#09090E',
  bgSecondary: '#12121E',
  bgCard: '#16162A',
  bgElevated: '#1A1A30',

  // ── Accent ───────────────────────────────────────────────
  accent: '#FF6B00',
  accentLight: '#FF8C33',
  accentDark: '#CC5500',
  accentGlow: 'rgba(255, 107, 0, 0.35)',
  accentGlowSubtle: 'rgba(255, 107, 0, 0.15)',

  // ── Text ─────────────────────────────────────────────────
  textPrimary: '#FFFFFF',
  textSecondary: '#8F8F9D',
  textMuted: '#5A5A6E',

  // ── Borders & Dividers ───────────────────────────────────
  border: 'rgba(255, 107, 0, 0.12)',
  borderAccent: 'rgba(255, 107, 0, 0.40)',
  divider: 'rgba(255, 255, 255, 0.06)',

  // ── Gradients ────────────────────────────────────────────
  gradientStart: 'rgba(9, 9, 14, 0)',
  gradientMiddle: 'rgba(9, 9, 14, 0.60)',
  gradientEnd: 'rgba(9, 9, 14, 0.95)',

  // ── Status ───────────────────────────────────────────────
  success: '#00C853',
  error: '#FF3D57',
  warning: '#FFB300',
};

export const SPACING = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
};

export const BORDER_RADIUS = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  pill: 999,
};

export const FONT_SIZES = {
  caption: 11,
  small: 12,
  body: 14,
  subtitle: 16,
  title: 20,
  heading: 26,
  hero: 32,
};

export const FONT_WEIGHTS = {
  regular: '400',
  medium: '500',
  semibold: '600',
  bold: '700',
  heavy: '800',
};

export const SHADOWS = {
  card: {
    shadowColor: COLORS.accent,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  glow: {
    shadowColor: COLORS.accent,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.45,
    shadowRadius: 20,
    elevation: 12,
  },
  subtle: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 4,
  },
};

import React, { useMemo, useRef, useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  Animated,
  PanResponder
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { COLORS } from '../../constants/theme';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

export default function ControlLayer({
  isPlaying,
  currentTime,
  duration,
  bufferedPosition,
  isBuffering,
  isSettingsOpen,
  isUltraClarityEnabled,
  currentQualityLabel,
  currentSpeedLabel,
  buttonSize = 'medium', // 'small' | 'medium' | 'large'
  skipInterval = 15,
  visible = true,
  onPlayPause,
  onSeek,
  onOpenSettings,
  onTogglePlaySpeed,
  onToggleUltraClarity
}) {
  const [sliderWidth, setSliderWidth] = useState(0);
  const isDraggingSliderRef = useRef(false);

  // Dynamic Size Scaler Map
  const sizeScale = useMemo(() => {
    switch (buttonSize) {
      case 'small': return 0.8;
      case 'large': return 1.2;
      case 'medium':
      default: return 1.0;
    }
  }, [buttonSize]);

  // Interpolate sizes based on scale
  const dynamicStyles = useMemo(() => {
    return {
      controlButton: {
        width: 44 * sizeScale,
        height: 44 * sizeScale,
        borderRadius: 22 * sizeScale,
      },
      playButton: {
        width: 58 * sizeScale,
        height: 58 * sizeScale,
        borderRadius: 29 * sizeScale,
      },
      iconSize: 22 * sizeScale,
      playIconSize: 28 * sizeScale,
      fontSize: 12 * sizeScale,
      timeFontSize: 13 * sizeScale
    };
  }, [sizeScale]);

  // Format time utility
  const formatTime = (seconds) => {
    if (isNaN(seconds) || seconds === Infinity) return '00:00';
    const s = Math.floor(seconds % 60);
    const m = Math.floor((seconds / 60) % 60);
    const h = Math.floor(seconds / 3600);
    const pad = (n) => n.toString().padStart(2, '0');
    if (h > 0) return pad(h) + ':' + pad(m) + ':' + pad(s);
    return pad(m) + ':' + pad(s);
  };

  // Custom Progress Slider PanResponder
  const handleTouchSeek = (clientX) => {
    if (sliderWidth <= 0 || duration <= 0) return;
    const targetPct = clientX / sliderWidth;
    const clampedPct = Math.max(0, Math.min(1, targetPct));
    onSeek(clampedPct * duration);
  };

  const sliderPanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (evt) => {
        isDraggingSliderRef.current = true;
        handleTouchSeek(evt.nativeEvent.locationX);
      },
      onPanResponderMove: (evt) => {
        handleTouchSeek(evt.nativeEvent.locationX);
      },
      onPanResponderRelease: () => {
        isDraggingSliderRef.current = false;
      }
    })
  ).current;

  // Calculate percentage values for fills
  const progressPct = duration > 0 ? (currentTime / duration) * 100 : 0;
  const bufferPct = duration > 0 ? (bufferedPosition / duration) * 100 : 0;

  if (!visible) return null;

  return (
    <View style={styles.overlayContainer}>
      {/* Top Bar Controls */}
      <View style={styles.topBar}>
        <View style={styles.badgeContainer}>
          {isUltraClarityEnabled && (
            <View style={styles.ucBadge}>
              <Text style={styles.ucBadgeText}>AI 4K HDR</Text>
            </View>
          )}
        </View>
        
        <View style={styles.topRightControls}>
          <TouchableOpacity 
            style={[styles.btnCircle, dynamicStyles.controlButton]} 
            onPress={onOpenSettings}
            activeOpacity={0.7}
          >
            <Ionicons name="settings" size={dynamicStyles.iconSize} color="#FFF" />
          </TouchableOpacity>
        </View>
      </View>

      {/* Center Controls */}
      <View style={styles.centerRow}>
        <TouchableOpacity 
          style={[styles.btnCircle, styles.secondaryControl, dynamicStyles.controlButton]} 
          onPress={() => onSeek(Math.max(0, currentTime - skipInterval))}
          activeOpacity={0.7}
        >
          <Ionicons name="play-back" size={dynamicStyles.iconSize} color="#FFF" />
          <Text style={styles.skipText}>{skipInterval}</Text>
        </TouchableOpacity>

        <TouchableOpacity 
          style={[styles.btnCircle, styles.playButton, dynamicStyles.playButton]} 
          onPress={onPlayPause}
          activeOpacity={0.7}
        >
          {isBuffering ? (
            <Text style={{color: '#FFF'}}>...</Text>
          ) : (
            <Ionicons 
              name={isPlaying ? "pause" : "play"} 
              size={dynamicStyles.playIconSize} 
              color="#000" 
              style={!isPlaying && { marginLeft: 3 }}
            />
          )}
        </TouchableOpacity>

        <TouchableOpacity 
          style={[styles.btnCircle, styles.secondaryControl, dynamicStyles.controlButton]} 
          onPress={() => onSeek(Math.min(duration, currentTime + skipInterval))}
          activeOpacity={0.7}
        >
          <Ionicons name="play-forward" size={dynamicStyles.iconSize} color="#FFF" />
          <Text style={styles.skipText}>{skipInterval}</Text>
        </TouchableOpacity>
      </View>

      {/* Bottom Bar Controls */}
      <View style={styles.bottomBar}>
        <View style={styles.timeRow}>
          <Text style={[styles.timeText, { fontSize: dynamicStyles.timeFontSize }]}>
            {formatTime(currentTime)} <Text style={{opacity: 0.5}}>/ {formatTime(duration)}</Text>
          </Text>
        </View>

        {/* Custom Progress Bar Slider */}
        <View 
          style={styles.sliderWrapper}
          onLayout={(evt) => setSliderWidth(evt.nativeEvent.layout.width)}
          {...sliderPanResponder.panHandlers}
        >
          <View style={styles.sliderTrack}>
            {/* Buffered Area */}
            <View style={[styles.sliderBuffer, { width: `${bufferPct}%` }]} />
            {/* Progress Area */}
            <View style={[styles.sliderFill, { width: `${progressPct}%` }]} />
            {/* Drag Handle Knob */}
            <View style={[styles.sliderKnob, { left: `${progressPct}%` }]} />
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlayContainer: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    justifyContent: 'space-between',
    padding: 16,
    zIndex: 3,
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%',
  },
  badgeContainer: {
    flexDirection: 'row',
    gap: 8,
  },
  ucBadge: {
    backgroundColor: 'rgba(255, 107, 0, 0.2)',
    borderColor: 'rgba(255, 107, 0, 0.4)',
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  ucBadgeText: {
    color: '#FF6B00',
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  topRightControls: {
    flexDirection: 'row',
    gap: 12,
  },
  btnCircle: {
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  secondaryControl: {
    position: 'relative',
  },
  skipText: {
    color: '#FFF',
    fontSize: 7,
    fontWeight: '900',
    position: 'absolute',
    bottom: 4,
  },
  playButton: {
    backgroundColor: '#FF6B00',
    borderColor: '#FF8E3C',
    elevation: 6,
    shadowColor: '#FF6B00',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  centerRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 36,
  },
  bottomBar: {
    width: '100%',
    gap: 10,
  },
  timeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  timeText: {
    color: '#FFF',
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  sliderWrapper: {
    height: 16,
    justifyContent: 'center',
    width: '100%',
  },
  sliderTrack: {
    height: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 2,
    position: 'relative',
    width: '100%',
  },
  sliderBuffer: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    backgroundColor: 'rgba(255, 255, 255, 0.35)',
    borderRadius: 2,
  },
  sliderFill: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    backgroundColor: '#FF6B00',
    borderRadius: 2,
  },
  sliderKnob: {
    position: 'absolute',
    top: -4,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#FFF',
    borderWidth: 2,
    borderColor: '#FF6B00',
    marginLeft: -6,
  }
});

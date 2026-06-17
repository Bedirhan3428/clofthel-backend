import React, { useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  PanResponder,
  Animated,
  Platform
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const DOUBLE_TAP_DELAY = 300;

export default function GestureLayer({
  currentTime,
  duration,
  onSeek,
  onPlayPause,
  skipInterval = 15,
  doubleTapEnabled = true,
  swipeSeekEnabled = true,
  children
}) {
  const [doubleTapSide, setDoubleTapSide] = useState(null); // 'left' | 'right' | null
  
  // Animation refs
  const doubleTapOpacity = useRef(new Animated.Value(0)).current;
  const doubleTapScale = useRef(new Animated.Value(0.8)).current;
  
  const lastTapRef = useRef(0);
  const startDragTimeRef = useRef(0);
  const isDraggingRef = useRef(false);
  const hasSwipedRef = useRef(false);

  // Trigger double tap skip animation
  const animateDoubleTap = (side) => {
    setDoubleTapSide(side);
    doubleTapOpacity.setValue(0);
    doubleTapScale.setValue(0.8);
    
    Animated.parallel([
      Animated.timing(doubleTapOpacity, {
        toValue: 0.9,
        duration: 200,
        useNativeDriver: true
      }),
      Animated.spring(doubleTapScale, {
        toValue: 1.1,
        tension: 80,
        friction: 5,
        useNativeDriver: true
      })
    ]).start(() => {
      Animated.timing(doubleTapOpacity, {
        toValue: 0,
        duration: 350,
        delay: 200,
        useNativeDriver: true
      }).start(() => setDoubleTapSide(null));
    });
  };

  const handleDoubleTap = (xCoord) => {
    const isLeft = xCoord < SCREEN_WIDTH / 2;
    const target = isLeft 
      ? Math.max(0, currentTime - skipInterval) 
      : Math.min(duration, currentTime + skipInterval);
    
    animateDoubleTap(isLeft ? 'left' : 'right');
    onSeek(target);
  };

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gestureState) => {
        // Set pan responder for movement only if swipeSeekEnabled is true and movement is horizontal
        return swipeSeekEnabled && Math.abs(gestureState.dx) > 10 && Math.abs(gestureState.dy) < 30;
      },
      onPanResponderGrant: () => {
        startDragTimeRef.current = currentTime;
        isDraggingRef.current = false;
        hasSwipedRef.current = false;
      },
      onPanResponderMove: (_, gestureState) => {
        if (!swipeSeekEnabled) return;
        
        isDraggingRef.current = true;
        
        if (!hasSwipedRef.current) {
          const dx = gestureState.dx;
          if (Math.abs(dx) > 45) {
            hasSwipedRef.current = true;
            const isLeftSwipe = dx < 0; // Right-to-Left (swipe left) is skip forward
            const target = isLeftSwipe
              ? Math.min(duration, currentTime + skipInterval)
              : Math.max(0, currentTime - skipInterval);
            
            animateDoubleTap(isLeftSwipe ? 'right' : 'left');
            onSeek(target);
          }
        }
      },
      onPanResponderRelease: (e, gestureState) => {
        if (hasSwipedRef.current) {
          hasSwipedRef.current = false;
          isDraggingRef.current = false;
        } else if (isDraggingRef.current) {
          isDraggingRef.current = false;
        } else {
          // Handle tap / double tap logic
          const currentTimeStamp = Date.now();
          const delay = currentTimeStamp - lastTapRef.current;
          
          if (doubleTapEnabled && delay < DOUBLE_TAP_DELAY && delay > 0) {
            handleDoubleTap(e.nativeEvent.locationX);
          } else {
            // Single tap: toggle controls (bubble event up to parent or trigger play/pause if no overlays)
            onPlayPause();
          }
          lastTapRef.current = currentTimeStamp;
        }
      }
    })
  ).current;

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

  return (
    <View style={styles.container} {...panResponder.panHandlers}>
      {children}



      {/* Double Tap Visual Indicator */}
      {doubleTapSide && (
        <View style={[
          styles.doubleTapOverlay, 
          doubleTapSide === 'left' ? styles.leftSide : styles.rightSide
        ]}>
          <Animated.View style={[
            styles.doubleTapContent,
            { opacity: doubleTapOpacity, transform: [{ scale: doubleTapScale }] }
          ]}>
            <Ionicons 
              name={doubleTapSide === 'left' ? "play-back" : "play-forward"} 
              size={36} 
              color="#FFF" 
            />
            <Text style={styles.doubleTapText}>{skipInterval}s</Text>
          </Animated.View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 2,
  },
  swipeOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  swipeContainer: {
    backgroundColor: 'rgba(18, 18, 23, 0.9)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 20,
    paddingHorizontal: 24,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  swipeTimeText: {
    color: '#FFF',
    fontSize: 20,
    fontWeight: '900',
    marginTop: 8,
  },
  swipeDiffText: {
    color: '#FF6B00',
    fontSize: 14,
    fontWeight: 'bold',
    marginTop: 2,
  },
  doubleTapOverlay: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: '50%',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 5,
  },
  leftSide: {
    left: 0,
    borderTopRightRadius: SCREEN_WIDTH / 2,
    borderBottomRightRadius: SCREEN_WIDTH / 2,
  },
  rightSide: {
    right: 0,
    borderTopLeftRadius: SCREEN_WIDTH / 2,
    borderBottomLeftRadius: SCREEN_WIDTH / 2,
  },
  doubleTapContent: {
    backgroundColor: 'rgba(255, 107, 0, 0.25)',
    borderRadius: 50,
    width: 90,
    height: 90,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 107, 0, 0.3)',
  },
  doubleTapText: {
    color: '#FFF',
    fontSize: 11,
    fontWeight: '900',
    marginTop: 4,
    textTransform: 'uppercase',
  }
});

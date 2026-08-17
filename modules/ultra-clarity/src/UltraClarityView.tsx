import { requireNativeViewManager } from 'expo-modules-core';
import * as React from 'react';
import { View } from 'react-native';

export type UltraClarityViewProps = {
  url?: string;
  isEnhancementActive?: boolean;
  style?: any;
  onProgress?: (event: { nativeEvent: { currentTime: number, duration: number, bufferedPosition: number } }) => void;
  onStatusChange?: (event: { nativeEvent: { isPlaying?: boolean, isBuffering?: boolean, isEnded?: boolean } }) => void;
};

let NativeView: React.ComponentType<UltraClarityViewProps & { ref?: any }> | null = null;
try {
  NativeView = requireNativeViewManager('UltraClarity');
} catch (e) {
  console.warn('[UltraClarityView] Native view manager not available in current runtime (e.g. Expo Go). Using fallback.');
}

export default React.forwardRef((props: UltraClarityViewProps, ref) => {
  const nativeRef = React.useRef<any>(null);

  React.useImperativeHandle(ref, () => ({
    play: async () => {
      if (nativeRef.current && nativeRef.current.play) {
        await nativeRef.current.play();
      }
    },
    pause: async () => {
      if (nativeRef.current && nativeRef.current.pause) {
        await nativeRef.current.pause();
      }
    },
    seekTo: async (positionMs: number) => {
      if (nativeRef.current && nativeRef.current.seekTo) {
        await nativeRef.current.seekTo(positionMs);
      }
    }
  }));

  if (!NativeView) {
    return <View style={props.style} />;
  }

  return <NativeView ref={nativeRef} {...props} />;
});

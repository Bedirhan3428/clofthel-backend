import { requireNativeViewManager } from 'expo-modules-core';
import * as React from 'react';

export type UltraClarityViewProps = {
  url?: string;
  isEnhancementActive?: boolean;
  style?: any;
  onProgress?: (event: { nativeEvent: { currentTime: number, duration: number, bufferedPosition: number } }) => void;
  onStatusChange?: (event: { nativeEvent: { isPlaying?: boolean, isBuffering?: boolean, isEnded?: boolean } }) => void;
};

const NativeView: React.ComponentType<UltraClarityViewProps & { ref?: any }> =
  requireNativeViewManager('UltraClarity');

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

  return <NativeView ref={nativeRef} {...props} />;
});

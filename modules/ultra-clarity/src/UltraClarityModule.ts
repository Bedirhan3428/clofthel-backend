import { NativeModule, requireNativeModule } from 'expo';

declare class UltraClarityModule extends NativeModule<{}> {
  simulateTouch(reactTag: number, x: number, y: number): Promise<boolean>;
}

let nativeModuleInstance: any = null;
try {
  nativeModuleInstance = requireNativeModule<UltraClarityModule>('UltraClarity');
} catch (e) {
  console.warn('[UltraClarity] Native module not available in current runtime (e.g. Expo Go). Using fallback.');
  nativeModuleInstance = {
    simulateTouch: async () => false,
  };
}

export default nativeModuleInstance;

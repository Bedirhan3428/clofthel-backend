import { NativeModule, requireNativeModule } from 'expo';

declare class UltraClarityModule extends NativeModule<{}> {
  simulateTouch(reactTag: number, x: number, y: number): Promise<boolean>;
}

export default requireNativeModule<UltraClarityModule>('UltraClarity');

import { NativeModule, requireNativeModule } from 'expo';

declare class UltraClarityModule extends NativeModule<{}> {}

export default requireNativeModule<UltraClarityModule>('UltraClarity');

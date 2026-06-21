import UltraClarity from '../../modules/ultra-clarity/src/UltraClarityModule';

const TouchInjector = {
  simulateTouch: async (reactTag, x, y) => {
    try {
      if (UltraClarity && typeof UltraClarity.simulateTouch === 'function') {
        return await UltraClarity.simulateTouch(reactTag, x, y);
      }
    } catch (e) {
      console.warn('[TouchInjector] simulateTouch failed:', e.message);
    }
    return false;
  }
};

export default TouchInjector;

import * as Device from 'expo-device';
import { getPerformanceProfile, setPerformanceProfile } from './preferences';

/**
 * Runs a CPU mathematical benchmark test in milliseconds.
 * Performs 1,000,000 iterations of trig and square root computations.
 * @returns {number} duration in milliseconds
 */
export function runCpuBenchmark() {
  const start = Date.now();
  
  let val = 0.5;
  for (let i = 0; i < 1000000; i++) {
    val = Math.sqrt(val) * Math.sin(val) + Math.cos(val);
  }
  
  const duration = Date.now() - start;
  console.log(`[PerformanceProfiler] CPU Benchmark completed in ${duration}ms, result: ${val}`);
  return duration;
}

/**
 * Profiles the device hardware and stores the classification.
 * Runs once on first startup or when triggered manually.
 * @param {boolean} force - Force re-run even if already profiled.
 * @returns {'low' | 'mid' | 'high'} The classified profile.
 */
export function profileDevice(force = false) {
  const existing = getPerformanceProfile();
  if (existing && !force) {
    console.log(`[PerformanceProfiler] Using cached profile: ${existing}`);
    return existing;
  }

  try {
    console.log('[PerformanceProfiler] Running hardware benchmark...');
    
    // 1. Run CPU Benchmark
    const duration = runCpuBenchmark();

    // 2. Read System Info from expo-device
    const totalMemoryBytes = Device.totalMemory || 0; // Might be 0 or null on iOS
    const totalMemoryGB = totalMemoryBytes / (1024 * 1024 * 1024);
    const model = (Device.modelName || '').toLowerCase();
    
    console.log(`[PerformanceProfiler] Device: ${Device.modelName}, RAM: ${totalMemoryGB.toFixed(2)} GB`);

    let profile = 'mid'; // Default fallback

    // 3. Classification Decision Engine
    if (totalMemoryBytes > 0 && totalMemoryGB < 3.0) {
      // Very low RAM (< 3GB) always Low-End
      profile = 'low';
    } else if (duration > 150) {
      // Extremely slow CPU benchmark always Low-End
      profile = 'low';
    } else if (totalMemoryGB >= 6.0 && duration < 75) {
      // High RAM (>= 6GB) and fast CPU is High-Performance
      profile = 'high';
    } else if (totalMemoryGB === 0) {
      // iOS / Fallback where RAM is unknown: base decision on model and CPU test
      const isHighEndIphone = model.includes('iphone') && 
        (model.includes('13 pro') || model.includes('14') || model.includes('15') || model.includes('16') || model.includes('pro max'));
      
      if (duration < 50 || isHighEndIphone) {
        profile = 'high';
      } else if (duration > 120) {
        profile = 'low';
      } else {
        profile = 'mid';
      }
    } else {
      // Default to Mid-Range for anything else (e.g. 3-6GB RAM, normal CPU)
      profile = 'mid';
    }

    console.log(`[PerformanceProfiler] Device classified as: ${profile.toUpperCase()}`);
    setPerformanceProfile(profile);
    return profile;
  } catch (err) {
    console.error('[PerformanceProfiler] Error profiling device, defaulting to MID:', err);
    setPerformanceProfile('mid');
    return 'mid';
  }
}

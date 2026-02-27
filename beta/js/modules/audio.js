// js/modules/audio.js
// Audio-Visual Synesthesia: Generative ambient soundscapes per gallery
// Uses Web Audio API — no samples, everything is procedurally generated
import { store } from '../lib/store.js';
import { bus } from '../lib/event-bus.js';
import { dom } from '../dom-elements.js';

// ============================================
// CONSTANTS
// ============================================
const MASTER_VOLUME = 0.18;         // Keep it ambient, not dominant
const CROSSFADE_DURATION = 2.5;     // Seconds to crossfade between soundscapes
const MODAL_DUCK_LEVEL = 0.4;       // Duck ambient volume when modal opens (multiplier)
const MODAL_DUCK_TIME = 0.6;        // Seconds to duck/restore

// ============================================
// STATE
// ============================================
let audioCtx = null;
let masterGain = null;
let currentScape = null;            // { galleryId, nodes, gainNode }
let isAudioEnabled = true;
let isUserActivated = false;        // True after first user gesture
const busUnsubs = [];

// ============================================
// NOISE GENERATORS
// ============================================

/** White noise source (looped buffer) */
function createNoiseSource() {
  const bufferSize = audioCtx.sampleRate * 4; // 4 seconds of noise
  const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    data[i] = Math.random() * 2 - 1;
  }
  const source = audioCtx.createBufferSource();
  source.buffer = buffer;
  source.loop = true;
  return source;
}

/**
 * Brown noise source — random walk integration of white noise.
 * Much warmer and more natural than sawtooth for city hum / rumble.
 */
function createBrownNoiseSource() {
  const bufferSize = audioCtx.sampleRate * 4;
  const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
  const data = buffer.getChannelData(0);
  let lastValue = 0;
  for (let i = 0; i < bufferSize; i++) {
    const white = Math.random() * 2 - 1;
    lastValue = (lastValue + (0.02 * white)) / 1.02; // leaky integrator
    data[i] = lastValue * 3.5; // normalize gain
  }
  const source = audioCtx.createBufferSource();
  source.buffer = buffer;
  source.loop = true;
  return source;
}

/**
 * Pink noise source — 1/f spectral slope.
 * More natural than white noise for hiss/air sounds.
 * Uses Voss-McCartney algorithm approximation.
 */
function createPinkNoiseSource() {
  const bufferSize = audioCtx.sampleRate * 4;
  const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
  const data = buffer.getChannelData(0);

  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
  for (let i = 0; i < bufferSize; i++) {
    const white = Math.random() * 2 - 1;
    b0 = 0.99886 * b0 + white * 0.0555179;
    b1 = 0.99332 * b1 + white * 0.0750759;
    b2 = 0.96900 * b2 + white * 0.1538520;
    b3 = 0.86650 * b3 + white * 0.3104856;
    b4 = 0.55000 * b4 + white * 0.5329522;
    b5 = -0.7616 * b5 - white * 0.0168980;
    data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11;
    b6 = white * 0.115926;
  }
  const source = audioCtx.createBufferSource();
  source.buffer = buffer;
  source.loop = true;
  return source;
}

// ============================================
// UTILITY: Distortion curves
// ============================================

/** Soft-clip distortion curve */
function makeDistortionCurve(amount) {
  const samples = 256;
  const curve = new Float32Array(samples);
  for (let i = 0; i < samples; i++) {
    const x = (i * 2) / samples - 1;
    curve[i] = ((Math.PI + amount) * x) / (Math.PI + amount * Math.abs(x));
  }
  return curve;
}

/**
 * Cone distortion curve — models loudspeaker cone breakup.
 * Asymmetric clipping with odd harmonics emphasis.
 */
function makeConeDistortionCurve(drive) {
  const samples = 512;
  const curve = new Float32Array(samples);
  for (let i = 0; i < samples; i++) {
    const x = (i * 2) / samples - 1;
    // Asymmetric waveshaping — positive excursion clips harder
    if (x >= 0) {
      curve[i] = Math.tanh(x * drive * 1.2);
    } else {
      curve[i] = Math.tanh(x * drive * 0.8) + 0.05 * Math.sin(x * drive * 3);
    }
  }
  return curve;
}

// ============================================
// SOUNDSCAPE DEFINITIONS
// ============================================

/**
 * Language of Windows — Filtered brown noise city hum, FM glass harmonics,
 * formant-filtered wind through gaps
 * Warm, contemplative, slightly melancholic urban ambience
 */
function createWindowsScape() {
  const gain = audioCtx.createGain();
  gain.gain.value = 0;
  gain.connect(masterGain);
  const nodes = [];

  // 1. City hum — filtered brown noise (replaces buzzy sawtooth)
  // Brown noise has the natural 1/f² spectral slope of urban rumble
  const cityNoise = createBrownNoiseSource();
  const cityLP = audioCtx.createBiquadFilter();
  cityLP.type = 'lowpass';
  cityLP.frequency.value = 120;
  cityLP.Q.value = 1.5;
  // Add a resonant peak around mains hum frequency
  const cityResonance = audioCtx.createBiquadFilter();
  cityResonance.type = 'peaking';
  cityResonance.frequency.value = 55;
  cityResonance.Q.value = 8;
  cityResonance.gain.value = 6;
  const cityGain = audioCtx.createGain();
  cityGain.gain.value = 0.35;
  // Slow drift on the resonant peak
  const cityLFO = audioCtx.createOscillator();
  cityLFO.type = 'sine';
  cityLFO.frequency.value = 0.04;
  const cityLFOGain = audioCtx.createGain();
  cityLFOGain.gain.value = 5;
  cityLFO.connect(cityLFOGain);
  cityLFOGain.connect(cityResonance.frequency);
  cityNoise.connect(cityLP);
  cityLP.connect(cityResonance);
  cityResonance.connect(cityGain);
  cityGain.connect(gain);
  cityNoise.start();
  cityLFO.start();
  nodes.push(cityNoise, cityLFO);

  // 2. Second harmonic layer — brown noise at higher register for body
  const city2 = createBrownNoiseSource();
  const city2BP = audioCtx.createBiquadFilter();
  city2BP.type = 'bandpass';
  city2BP.frequency.value = 82;
  city2BP.Q.value = 4;
  const city2Gain = audioCtx.createGain();
  city2Gain.gain.value = 0.12;
  city2.connect(city2BP);
  city2BP.connect(city2Gain);
  city2Gain.connect(gain);
  city2.start();
  nodes.push(city2);

  // 3. Glass harmonics — FM synthesis with high-Q resonant filters
  // Carrier + modulator create complex harmonic partials that sound like
  // glass vibrating / singing in window frames
  const glassCarrier = audioCtx.createOscillator();
  glassCarrier.type = 'sine';
  glassCarrier.frequency.value = 1480; // Glass resonant frequency range

  const glassMod = audioCtx.createOscillator();
  glassMod.type = 'sine';
  glassMod.frequency.value = 3.7; // Slow FM for shimmering harmonics
  const glassModGain = audioCtx.createGain();
  glassModGain.gain.value = 120; // FM depth — creates harmonic sidebands
  glassMod.connect(glassModGain);
  glassModGain.connect(glassCarrier.frequency);

  // High-Q bandpass filters to pick out specific glass resonances
  const glassRes1 = audioCtx.createBiquadFilter();
  glassRes1.type = 'bandpass';
  glassRes1.frequency.value = 1480;
  glassRes1.Q.value = 50;
  const glassRes2 = audioCtx.createBiquadFilter();
  glassRes2.type = 'bandpass';
  glassRes2.frequency.value = 2960; // Second partial
  glassRes2.Q.value = 40;

  const glassGain1 = audioCtx.createGain();
  glassGain1.gain.value = 0.02;
  const glassGain2 = audioCtx.createGain();
  glassGain2.gain.value = 0.012;

  // Slowly sweep the FM modulation depth for evolving texture
  const glassSweepLFO = audioCtx.createOscillator();
  glassSweepLFO.type = 'sine';
  glassSweepLFO.frequency.value = 0.06;
  const glassSweepGain = audioCtx.createGain();
  glassSweepGain.gain.value = 60;
  glassSweepLFO.connect(glassSweepGain);
  glassSweepGain.connect(glassModGain.gain);

  glassCarrier.connect(glassRes1);
  glassCarrier.connect(glassRes2);
  glassRes1.connect(glassGain1);
  glassRes2.connect(glassGain2);
  glassGain1.connect(gain);
  glassGain2.connect(gain);

  glassCarrier.start();
  glassMod.start();
  glassSweepLFO.start();
  nodes.push(glassCarrier, glassMod, glassSweepLFO);

  // Second glass voice at different pitch for richness
  const glass2Carrier = audioCtx.createOscillator();
  glass2Carrier.type = 'sine';
  glass2Carrier.frequency.value = 2200;
  const glass2Mod = audioCtx.createOscillator();
  glass2Mod.type = 'sine';
  glass2Mod.frequency.value = 5.1; // Different rate for variety
  const glass2ModGain = audioCtx.createGain();
  glass2ModGain.gain.value = 80;
  glass2Mod.connect(glass2ModGain);
  glass2ModGain.connect(glass2Carrier.frequency);

  const glass2Filter = audioCtx.createBiquadFilter();
  glass2Filter.type = 'bandpass';
  glass2Filter.frequency.value = 2200;
  glass2Filter.Q.value = 45;
  const glass2Gain = audioCtx.createGain();
  glass2Gain.gain.value = 0.015;

  glass2Carrier.connect(glass2Filter);
  glass2Filter.connect(glass2Gain);
  glass2Gain.connect(gain);
  glass2Carrier.start();
  glass2Mod.start();
  nodes.push(glass2Carrier, glass2Mod);

  // 4. Wind through window gaps — formant-filtered noise
  // Real wind through gaps creates formant resonances as the gap acts
  // like a vocal tract; we model this with cascaded bandpass filters
  // at formant-like frequencies
  const windNoise = createNoiseSource();

  // Formant filters — model the resonance of air through narrow gaps
  const windFormant1 = audioCtx.createBiquadFilter();
  windFormant1.type = 'bandpass';
  windFormant1.frequency.value = 400;  // First formant
  windFormant1.Q.value = 12;

  const windFormant2 = audioCtx.createBiquadFilter();
  windFormant2.type = 'bandpass';
  windFormant2.frequency.value = 1100; // Second formant
  windFormant2.Q.value = 10;

  const windFormant3 = audioCtx.createBiquadFilter();
  windFormant3.type = 'bandpass';
  windFormant3.frequency.value = 2400; // Third formant — whistle
  windFormant3.Q.value = 15;

  const windF1Gain = audioCtx.createGain();
  windF1Gain.gain.value = 0;
  const windF2Gain = audioCtx.createGain();
  windF2Gain.gain.value = 0;
  const windF3Gain = audioCtx.createGain();
  windF3Gain.gain.value = 0;

  // Each formant path: noise → formant filter → gain → output
  windNoise.connect(windFormant1);
  windNoise.connect(windFormant2);
  windNoise.connect(windFormant3);
  windFormant1.connect(windF1Gain);
  windFormant2.connect(windF2Gain);
  windFormant3.connect(windF3Gain);
  windF1Gain.connect(gain);
  windF2Gain.connect(gain);
  windF3Gain.connect(gain);

  windNoise.start();
  nodes.push(windNoise);

  // Modulate wind in/out — each formant fades independently for realism
  scheduleFormantWindGusts(windF1Gain, windF2Gain, windF3Gain,
                           windFormant1, windFormant2, windFormant3);

  return { nodes, gainNode: gain, galleryId: 'low' };
}

/**
 * Reflections — Physical-modeled droplets, granular reverse reverb,
 * ring-modulated shimmer
 * Ethereal, watery, slightly disorienting
 */
function createReflectionsScape() {
  const gain = audioCtx.createGain();
  gain.gain.value = 0;
  gain.connect(masterGain);
  const nodes = [];

  // 1. Underwater drone — low filtered pad
  const subDrone = audioCtx.createOscillator();
  subDrone.type = 'triangle';
  subDrone.frequency.value = 65;
  const subFilter = audioCtx.createBiquadFilter();
  subFilter.type = 'lowpass';
  subFilter.frequency.value = 150;
  subFilter.Q.value = 5;
  const subGain = audioCtx.createGain();
  subGain.gain.value = 0.25;
  const subLFO = audioCtx.createOscillator();
  subLFO.type = 'sine';
  subLFO.frequency.value = 0.15;
  const subLFOGain = audioCtx.createGain();
  subLFOGain.gain.value = 8;
  subLFO.connect(subLFOGain);
  subLFOGain.connect(subDrone.frequency);
  subDrone.connect(subFilter);
  subFilter.connect(subGain);
  subGain.connect(gain);
  subDrone.start();
  subLFO.start();
  nodes.push(subDrone, subLFO);

  // 2. Reverse reverb — granular-style envelope shaping on noise
  // Instead of simple linear swell, we create overlapping "grains" that
  // each have exponential-rise envelopes, simulating reversed reverb tails
  const reverbNoise = createNoiseSource();
  const reverbBP = audioCtx.createBiquadFilter();
  reverbBP.type = 'bandpass';
  reverbBP.frequency.value = 1200;
  reverbBP.Q.value = 0.8;
  const reverbGain = audioCtx.createGain();
  reverbGain.gain.value = 0;
  reverbNoise.connect(reverbBP);
  reverbBP.connect(reverbGain);
  reverbGain.connect(gain);
  reverbNoise.start();
  nodes.push(reverbNoise);

  scheduleGranularReversedSwells(reverbGain, reverbBP, gain);

  // 3. Physical-modeled water droplets — impact + exponential decay
  schedulePhysicalDroplets(gain);

  // 4. Watery shimmer — ring modulation
  // Ring mod creates inharmonic sidebands that sound metallic / watery
  const shimmerCarrier = audioCtx.createOscillator();
  shimmerCarrier.type = 'sine';
  shimmerCarrier.frequency.value = 1800;

  const shimmerMod = audioCtx.createOscillator();
  shimmerMod.type = 'sine';
  shimmerMod.frequency.value = 67; // Creates inharmonic sidebands

  // Ring modulation = multiply two signals
  // We use a gain node whose gain is controlled by the modulator
  const ringGain = audioCtx.createGain();
  ringGain.gain.value = 0; // Modulator will control this
  shimmerMod.connect(ringGain.gain);
  shimmerCarrier.connect(ringGain);

  // Filter the ring mod output for a watery quality
  const ringFilter = audioCtx.createBiquadFilter();
  ringFilter.type = 'bandpass';
  ringFilter.frequency.value = 2000;
  ringFilter.Q.value = 2;

  const ringOutput = audioCtx.createGain();
  ringOutput.gain.value = 0.018;

  // Slow sweep on the carrier for evolving texture
  const ringLFO = audioCtx.createOscillator();
  ringLFO.type = 'sine';
  ringLFO.frequency.value = 0.07;
  const ringLFOGain = audioCtx.createGain();
  ringLFOGain.gain.value = 200;
  ringLFO.connect(ringLFOGain);
  ringLFOGain.connect(shimmerCarrier.frequency);

  // Also modulate the ring mod frequency for organic feel
  const ringModLFO = audioCtx.createOscillator();
  ringModLFO.type = 'sine';
  ringModLFO.frequency.value = 0.03;
  const ringModLFOGain = audioCtx.createGain();
  ringModLFOGain.gain.value = 15;
  ringModLFO.connect(ringModLFOGain);
  ringModLFOGain.connect(shimmerMod.frequency);

  ringGain.connect(ringFilter);
  ringFilter.connect(ringOutput);
  ringOutput.connect(gain);

  shimmerCarrier.start();
  shimmerMod.start();
  ringLFO.start();
  ringModLFO.start();
  nodes.push(shimmerCarrier, shimmerMod, ringLFO, ringModLFO);

  return { nodes, gainNode: gain, galleryId: 'r' };
}

/**
 * Street Art — Particle-based spray can, cone-distorted bass, pink noise hiss
 * Energetic, raw, rhythmic urban pulse
 */
function createStreetArtScape() {
  const gain = audioCtx.createGain();
  gain.gain.value = 0;
  gain.connect(masterGain);
  const nodes = [];

  // 1. Urban sub-bass with cone distortion
  // Models the sound of bass through a blown-out speaker cone
  const subBass = audioCtx.createOscillator();
  subBass.type = 'sine';
  subBass.frequency.value = 40;

  const subBassFilter = audioCtx.createBiquadFilter();
  subBassFilter.type = 'lowpass';
  subBassFilter.frequency.value = 90;

  // Cone distortion waveshaper — asymmetric clipping
  const coneDistortion = audioCtx.createWaveShaper();
  coneDistortion.curve = makeConeDistortionCurve(3.5);
  coneDistortion.oversample = '2x'; // Reduce aliasing

  // Post-distortion filter to tame harsh harmonics
  const conePostFilter = audioCtx.createBiquadFilter();
  conePostFilter.type = 'lowpass';
  conePostFilter.frequency.value = 200;
  conePostFilter.Q.value = 1.5;

  const subBassGain = audioCtx.createGain();
  subBassGain.gain.value = 0.28;

  // Slow rhythmic pulse
  const bassLFO = audioCtx.createOscillator();
  bassLFO.type = 'sine';
  bassLFO.frequency.value = 0.25;
  const bassLFOGain = audioCtx.createGain();
  bassLFOGain.gain.value = 0.14;
  bassLFO.connect(bassLFOGain);
  bassLFOGain.connect(subBassGain.gain);

  subBass.connect(subBassFilter);
  subBassFilter.connect(coneDistortion);
  coneDistortion.connect(conePostFilter);
  conePostFilter.connect(subBassGain);
  subBassGain.connect(gain);
  subBass.start();
  bassLFO.start();
  nodes.push(subBass, bassLFO);

  // 2. Spray can — particle noise model (multiple short overlapping bursts)
  // A real spray can produces a stream of paint particles, each creating
  // tiny noise impacts. We model this with scheduled micro-bursts.
  const sprayNoise = createPinkNoiseSource();
  const sprayBP = audioCtx.createBiquadFilter();
  sprayBP.type = 'bandpass';
  sprayBP.frequency.value = 5500;
  sprayBP.Q.value = 1.8;
  const sprayGain = audioCtx.createGain();
  sprayGain.gain.value = 0;
  sprayNoise.connect(sprayBP);
  sprayBP.connect(sprayGain);
  sprayGain.connect(gain);
  sprayNoise.start();
  nodes.push(sprayNoise);

  scheduleParticleSprayBursts(sprayGain, sprayBP, gain);

  // 3. Spray hiss — pink noise with bandpass sweeping
  // The continuous aerosol hiss between spray strokes
  const hissNoise = createPinkNoiseSource();
  const hissBP = audioCtx.createBiquadFilter();
  hissBP.type = 'bandpass';
  hissBP.frequency.value = 6000;
  hissBP.Q.value = 1.2;
  const hissGain = audioCtx.createGain();
  hissGain.gain.value = 0.025;
  // Sweep the bandpass for organic movement
  const hissSweepLFO = audioCtx.createOscillator();
  hissSweepLFO.type = 'sine';
  hissSweepLFO.frequency.value = 0.12;
  const hissSweepGain = audioCtx.createGain();
  hissSweepGain.gain.value = 2000;
  hissSweepLFO.connect(hissSweepGain);
  hissSweepGain.connect(hissBP.frequency);

  hissNoise.connect(hissBP);
  hissBP.connect(hissGain);
  hissGain.connect(gain);
  hissNoise.start();
  hissSweepLFO.start();
  nodes.push(hissNoise, hissSweepLFO);

  // 4. Gritty mid-range — distorted filtered noise for texture
  const gritNoise = createNoiseSource();
  const gritFilter = audioCtx.createBiquadFilter();
  gritFilter.type = 'bandpass';
  gritFilter.frequency.value = 400;
  gritFilter.Q.value = 3;
  const waveshaper = audioCtx.createWaveShaper();
  waveshaper.curve = makeDistortionCurve(20);
  const gritGain = audioCtx.createGain();
  gritGain.gain.value = 0.04;
  gritNoise.connect(gritFilter);
  gritFilter.connect(waveshaper);
  waveshaper.connect(gritGain);
  gritGain.connect(gain);
  gritNoise.start();
  nodes.push(gritNoise);

  // 5. Distant traffic rumble
  const trafficNoise = createBrownNoiseSource();
  const trafficFilter = audioCtx.createBiquadFilter();
  trafficFilter.type = 'lowpass';
  trafficFilter.frequency.value = 200;
  trafficFilter.Q.value = 0.5;
  const trafficGain = audioCtx.createGain();
  trafficGain.gain.value = 0.07;
  const trafficLFO = audioCtx.createOscillator();
  trafficLFO.type = 'sine';
  trafficLFO.frequency.value = 0.07;
  const trafficLFOGain = audioCtx.createGain();
  trafficLFOGain.gain.value = 0.035;
  trafficLFO.connect(trafficLFOGain);
  trafficLFOGain.connect(trafficGain.gain);
  trafficNoise.connect(trafficFilter);
  trafficFilter.connect(trafficGain);
  trafficGain.connect(gain);
  trafficNoise.start();
  trafficLFO.start();
  nodes.push(trafficNoise, trafficLFO);

  return { nodes, gainNode: gain, galleryId: 'sa' };
}

/**
 * Snapshots of Life — Mechanical shutter clicks, formant-filtered conversations
 * Documentary, human, warmly voyeuristic
 */
function createSnapshotsScape() {
  const gain = audioCtx.createGain();
  gain.gain.value = 0;
  gain.connect(masterGain);
  const nodes = [];

  // 1. Room tone / ambient hum — warm fundamental
  const roomTone = audioCtx.createOscillator();
  roomTone.type = 'sine';
  roomTone.frequency.value = 60;
  const roomFilter = audioCtx.createBiquadFilter();
  roomFilter.type = 'lowpass';
  roomFilter.frequency.value = 100;
  const roomGain = audioCtx.createGain();
  roomGain.gain.value = 0.12;
  roomTone.connect(roomFilter);
  roomFilter.connect(roomGain);
  roomGain.connect(gain);
  roomTone.start();
  nodes.push(roomTone);

  // 2. Formant-filtered conversations — noise shaped through vocal tract model
  // Real speech has formant resonances at F1 (~300-800), F2 (~800-2500),
  // F3 (~2500-3500). We filter noise through parallel formant filters.
  const convNoise = createNoiseSource();

  // Vocal tract formant filters (parallel architecture)
  const vocF1 = audioCtx.createBiquadFilter();
  vocF1.type = 'bandpass';
  vocF1.frequency.value = 500;  // F1 — openness
  vocF1.Q.value = 10;

  const vocF2 = audioCtx.createBiquadFilter();
  vocF2.type = 'bandpass';
  vocF2.frequency.value = 1500; // F2 — frontness/backness
  vocF2.Q.value = 12;

  const vocF3 = audioCtx.createBiquadFilter();
  vocF3.type = 'bandpass';
  vocF3.frequency.value = 2800; // F3 — lip rounding/speaker identity
  vocF3.Q.value = 14;

  const vocF4 = audioCtx.createBiquadFilter();
  vocF4.type = 'bandpass';
  vocF4.frequency.value = 3500; // F4 — sibilance / presence
  vocF4.Q.value = 10;

  // Mix the formants with relative levels mimicking real speech
  const vocF1Gain = audioCtx.createGain();
  vocF1Gain.gain.value = 0;
  const vocF2Gain = audioCtx.createGain();
  vocF2Gain.gain.value = 0;
  const vocF3Gain = audioCtx.createGain();
  vocF3Gain.gain.value = 0;
  const vocF4Gain = audioCtx.createGain();
  vocF4Gain.gain.value = 0;

  // Muffle the output — these are distant/muffled conversations
  const convMuffle = audioCtx.createBiquadFilter();
  convMuffle.type = 'lowpass';
  convMuffle.frequency.value = 1800;
  convMuffle.Q.value = 0.7;

  convNoise.connect(vocF1);
  convNoise.connect(vocF2);
  convNoise.connect(vocF3);
  convNoise.connect(vocF4);
  vocF1.connect(vocF1Gain);
  vocF2.connect(vocF2Gain);
  vocF3.connect(vocF3Gain);
  vocF4.connect(vocF4Gain);
  vocF1Gain.connect(convMuffle);
  vocF2Gain.connect(convMuffle);
  vocF3Gain.connect(convMuffle);
  vocF4Gain.connect(convMuffle);
  convMuffle.connect(gain);

  convNoise.start();
  nodes.push(convNoise);

  // Modulate formant gains and frequencies with speech-like rhythm
  scheduleFormantConversationBursts(
    vocF1, vocF2, vocF3, vocF4,
    vocF1Gain, vocF2Gain, vocF3Gain, vocF4Gain
  );

  // 3. Mechanical shutter clicks — square wave bursts + noise transients
  scheduleMechanicalShutterClicks(gain);

  // 4. Outdoor ambience — gentle broadband noise, like a park
  const ambNoise = createNoiseSource();
  const ambFilter = audioCtx.createBiquadFilter();
  ambFilter.type = 'bandpass';
  ambFilter.frequency.value = 2000;
  ambFilter.Q.value = 0.3;
  const ambGain = audioCtx.createGain();
  ambGain.gain.value = 0.03;
  const ambLFO = audioCtx.createOscillator();
  ambLFO.type = 'sine';
  ambLFO.frequency.value = 0.04;
  const ambLFOGain = audioCtx.createGain();
  ambLFOGain.gain.value = 0.015;
  ambLFO.connect(ambLFOGain);
  ambLFOGain.connect(ambGain.gain);
  ambNoise.connect(ambFilter);
  ambFilter.connect(ambGain);
  ambGain.connect(gain);
  ambNoise.start();
  ambLFO.start();
  nodes.push(ambNoise, ambLFO);

  return { nodes, gainNode: gain, galleryId: 'sol' };
}

// ============================================
// SCHEDULED TEXTURE GENERATORS
// ============================================

/**
 * Formant-filtered wind gusts for Windows gallery.
 * Each formant fades in/out independently — the "vowel" of the wind
 * shifts as different formants peak at different times.
 */
function scheduleFormantWindGusts(f1Gain, f2Gain, f3Gain, f1Filter, f2Filter, f3Filter) {
  let active = true;

  function gust() {
    if (!active || !audioCtx || audioCtx.state === 'closed') return;
    const now = audioCtx.currentTime;
    const duration = 2.5 + Math.random() * 5;

    // Randomize formant frequencies for this gust — models different gap widths
    f1Filter.frequency.setValueAtTime(300 + Math.random() * 300, now);
    f2Filter.frequency.setValueAtTime(900 + Math.random() * 500, now);
    f3Filter.frequency.setValueAtTime(2000 + Math.random() * 1000, now);

    // Each formant swells at a slightly different rate — creates vowel shift
    const baseIntensity = 0.02 + Math.random() * 0.04;

    // F1 — the body of the wind
    const f1Peak = duration * (0.25 + Math.random() * 0.15);
    f1Gain.gain.setValueAtTime(0, now);
    f1Gain.gain.linearRampToValueAtTime(baseIntensity * 1.0, now + f1Peak);
    f1Gain.gain.linearRampToValueAtTime(baseIntensity * 0.4, now + duration * 0.7);
    f1Gain.gain.linearRampToValueAtTime(0, now + duration);

    // F2 — the "voice" of the wind
    const f2Peak = duration * (0.35 + Math.random() * 0.2);
    f2Gain.gain.setValueAtTime(0, now);
    f2Gain.gain.linearRampToValueAtTime(baseIntensity * 0.7, now + f2Peak);
    f2Gain.gain.linearRampToValueAtTime(baseIntensity * 0.3, now + duration * 0.8);
    f2Gain.gain.linearRampToValueAtTime(0, now + duration);

    // F3 — the whistle (only sometimes prominent)
    if (Math.random() > 0.4) {
      const f3Peak = duration * (0.4 + Math.random() * 0.2);
      f3Gain.gain.setValueAtTime(0, now);
      f3Gain.gain.linearRampToValueAtTime(baseIntensity * 0.35, now + f3Peak);
      f3Gain.gain.linearRampToValueAtTime(0, now + duration * 0.85);
    }

    const nextIn = (duration + 1 + Math.random() * 5) * 1000;
    setTimeout(gust, nextIn);
  }

  setTimeout(gust, 2000 + Math.random() * 3000);
  f1Gain._cleanup = () => { active = false; };
}

/**
 * Granular-style reversed reverb swells for Reflections gallery.
 * Overlapping "grains" of noise with exponential-rise envelopes,
 * each at slightly different pitch/density.
 */
function scheduleGranularReversedSwells(reverbGain, reverbBP, parentGain) {
  let active = true;

  function swell() {
    if (!active || !audioCtx || audioCtx.state === 'closed') return;
    const now = audioCtx.currentTime;
    const swellDuration = 3 + Math.random() * 4;
    const centerFreq = 800 + Math.random() * 1200;
    const grainCount = 6 + Math.floor(Math.random() * 8);

    reverbBP.frequency.setValueAtTime(centerFreq, now);

    // Build up through overlapping grains with exponential envelopes
    for (let g = 0; g < grainCount; g++) {
      const grainStart = now + (swellDuration * 0.8 * g) / grainCount;
      const grainDur = swellDuration / grainCount * (1.5 + Math.random() * 0.5);
      const grainPeak = 0.01 + Math.random() * 0.02;

      // Each grain has an exponential rise (the "reverse" effect)
      const grainPhase = g / grainCount;
      const intensity = grainPeak * (0.3 + grainPhase * 0.7); // Builds up

      reverbGain.gain.setValueAtTime(0.001, grainStart);
      // Exponential rise — this is what makes it sound "reversed"
      reverbGain.gain.exponentialRampToValueAtTime(
        intensity, grainStart + grainDur * 0.9
      );
      // Sharp cut (like reversed reverb snapping to the impact point)
      reverbGain.gain.linearRampToValueAtTime(0.001, grainStart + grainDur * 0.95);
    }

    // Final peak — the "impact" moment where the reversed tail meets its origin
    const peakTime = now + swellDuration * 0.85;
    reverbGain.gain.setValueAtTime(0.06 + Math.random() * 0.04, peakTime);
    reverbGain.gain.exponentialRampToValueAtTime(0.001, peakTime + 0.08);
    reverbGain.gain.setValueAtTime(0, peakTime + 0.1);

    const nextIn = (swellDuration + 2 + Math.random() * 6) * 1000;
    setTimeout(swell, nextIn);
  }

  setTimeout(swell, 1500);
  reverbGain._cleanup = () => { active = false; };
}

/**
 * Physical-modeled water droplets for Reflections gallery.
 * Models: impact excitation → body resonance with exponential decay
 * Plus secondary ripple harmonics and optional splash.
 */
function schedulePhysicalDroplets(parentGain) {
  let active = true;

  function droplet() {
    if (!active || !audioCtx || audioCtx.state === 'closed') return;
    const now = audioCtx.currentTime;

    // Physical model parameters
    const dropSize = Math.random(); // 0 = tiny, 1 = large
    const bodyFreq = 2400 - dropSize * 1200; // Larger drops = lower pitch
    const decayTime = 0.08 + dropSize * 0.15; // Larger drops ring longer

    // --- Impact transient (broadband noise burst) ---
    const impactNoise = createNoiseSource();
    const impactBP = audioCtx.createBiquadFilter();
    impactBP.type = 'bandpass';
    impactBP.frequency.value = bodyFreq * 1.5;
    impactBP.Q.value = 3;
    const impactGain = audioCtx.createGain();
    const impactLevel = 0.04 + dropSize * 0.06;
    // Very sharp attack, immediate exponential decay (impact model)
    impactGain.gain.setValueAtTime(impactLevel, now);
    impactGain.gain.exponentialRampToValueAtTime(0.001, now + 0.008);

    impactNoise.connect(impactBP);
    impactBP.connect(impactGain);
    impactGain.connect(parentGain);
    impactNoise.start(now);
    impactNoise.stop(now + 0.015);

    // --- Body resonance (tuned oscillator with exponential decay) ---
    const bodyOsc = audioCtx.createOscillator();
    bodyOsc.type = 'sine';
    bodyOsc.frequency.setValueAtTime(bodyFreq, now);
    // Pitch drop as the droplet cavity collapses
    bodyOsc.frequency.exponentialRampToValueAtTime(bodyFreq * 0.55, now + decayTime);

    const bodyGain = audioCtx.createGain();
    bodyGain.gain.setValueAtTime(0.05 + dropSize * 0.04, now);
    bodyGain.gain.exponentialRampToValueAtTime(0.001, now + decayTime);

    bodyOsc.connect(bodyGain);
    bodyGain.connect(parentGain);
    bodyOsc.start(now);
    bodyOsc.stop(now + decayTime + 0.02);

    // --- Secondary harmonic (first partial of droplet cavity) ---
    const harm1 = audioCtx.createOscillator();
    harm1.type = 'sine';
    harm1.frequency.setValueAtTime(bodyFreq * 2.12, now); // Slightly inharmonic
    harm1.frequency.exponentialRampToValueAtTime(bodyFreq * 1.2, now + decayTime * 0.7);
    const harm1Gain = audioCtx.createGain();
    harm1Gain.gain.setValueAtTime(0.02, now);
    harm1Gain.gain.exponentialRampToValueAtTime(0.001, now + decayTime * 0.6);
    harm1.connect(harm1Gain);
    harm1Gain.connect(parentGain);
    harm1.start(now);
    harm1.stop(now + decayTime * 0.7 + 0.02);

    // --- Ripple (delayed secondary impact — splash) ---
    if (Math.random() > 0.35) {
      const rippleDelay = 0.04 + Math.random() * 0.06;
      const rippleOsc = audioCtx.createOscillator();
      rippleOsc.type = 'sine';
      rippleOsc.frequency.setValueAtTime(bodyFreq * 0.72, now + rippleDelay);
      rippleOsc.frequency.exponentialRampToValueAtTime(
        bodyFreq * 0.4, now + rippleDelay + decayTime * 1.2
      );
      const rippleGain = audioCtx.createGain();
      rippleGain.gain.setValueAtTime(0.001, now);
      rippleGain.gain.setValueAtTime(0.025, now + rippleDelay);
      rippleGain.gain.exponentialRampToValueAtTime(
        0.001, now + rippleDelay + decayTime * 1.2
      );
      rippleOsc.connect(rippleGain);
      rippleGain.connect(parentGain);
      rippleOsc.start(now + rippleDelay);
      rippleOsc.stop(now + rippleDelay + decayTime * 1.3 + 0.02);
    }

    const nextIn = 400 + Math.random() * 2500;
    setTimeout(droplet, nextIn);
  }

  setTimeout(droplet, 800);
  parentGain._dropletCleanup = () => { active = false; };
}

/**
 * Particle-based spray can bursts for Street Art gallery.
 * Each "spray" consists of many overlapping micro-bursts that model
 * individual paint particles hitting a surface.
 */
function scheduleParticleSprayBursts(sprayGain, sprayBP, parentGain) {
  let active = true;

  function spray() {
    if (!active || !audioCtx || audioCtx.state === 'closed') return;
    const now = audioCtx.currentTime;
    const strokeDuration = 0.4 + Math.random() * 1.8;
    const baseFreq = 4000 + Math.random() * 4000;
    const particleCount = 8 + Math.floor(Math.random() * 16);

    sprayBP.frequency.setValueAtTime(baseFreq, now);

    // Envelope the overall spray stroke
    const baseIntensity = 0.04 + Math.random() * 0.06;

    // Quick attack into the spray stroke
    sprayGain.gain.setValueAtTime(0, now);
    sprayGain.gain.linearRampToValueAtTime(baseIntensity * 0.3, now + 0.01);

    // Individual particle bursts within the stroke
    for (let p = 0; p < particleCount; p++) {
      const pTime = now + (strokeDuration * p) / particleCount;
      const pIntensity = baseIntensity * (0.4 + Math.random() * 0.6);
      const burstLen = 0.01 + Math.random() * 0.03;

      // Each particle: quick spike then brief decay
      sprayGain.gain.setValueAtTime(pIntensity, pTime);
      sprayGain.gain.linearRampToValueAtTime(
        pIntensity * (0.3 + Math.random() * 0.3),
        pTime + burstLen
      );

      // Slight frequency variation per particle (nozzle turbulence)
      sprayBP.frequency.setValueAtTime(
        baseFreq + (Math.random() - 0.5) * 1500,
        pTime
      );
    }

    // Release at end of stroke
    sprayGain.gain.linearRampToValueAtTime(0, now + strokeDuration);

    const nextIn = (strokeDuration + 1.5 + Math.random() * 5) * 1000;
    setTimeout(spray, nextIn);
  }

  setTimeout(spray, 1000 + Math.random() * 2000);
  sprayGain._cleanup = () => { active = false; };
}

/**
 * Formant-filtered conversation bursts for Snapshots gallery.
 * Modulates 4 formant filters to shift between vowel-like sounds,
 * mimicking the spectral envelope of human speech.
 */
function scheduleFormantConversationBursts(f1, f2, f3, f4, g1, g2, g3, g4) {
  let active = true;

  // Vowel formant targets (F1, F2, F3, F4 in Hz)
  const vowels = [
    { f1: 730, f2: 1090, f3: 2440, f4: 3400 }, // /a/ as in "father"
    { f1: 390, f2: 1990, f3: 2550, f4: 3300 }, // /i/ as in "see"
    { f1: 520, f2: 1190, f3: 2390, f4: 3300 }, // /e/ as in "bed"
    { f1: 660, f2: 1020, f3: 2240, f4: 3200 }, // /ɔ/ as in "law"
    { f1: 300, f2: 870,  f3: 2240, f4: 3200 }, // /u/ as in "boot"
    { f1: 640, f2: 1220, f3: 2500, f4: 3350 }, // /ʌ/ as in "but"
  ];

  function burst() {
    if (!active || !audioCtx || audioCtx.state === 'closed') return;
    const now = audioCtx.currentTime;
    const duration = 1.5 + Math.random() * 3;
    const intensity = 0.025 + Math.random() * 0.03;

    // Number of "syllables" in this speech fragment
    const syllables = 3 + Math.floor(Math.random() * 6);
    const syllableDur = duration / syllables;

    for (let s = 0; s < syllables; s++) {
      const t = now + syllableDur * s;
      const vowel = vowels[Math.floor(Math.random() * vowels.length)];
      const syllableLevel = intensity * (0.3 + Math.random() * 0.7);

      // Transition formant frequencies (vowel articulation)
      const transitionTime = 0.04 + Math.random() * 0.03;
      f1.frequency.linearRampToValueAtTime(vowel.f1, t + transitionTime);
      f2.frequency.linearRampToValueAtTime(vowel.f2, t + transitionTime);
      f3.frequency.linearRampToValueAtTime(vowel.f3, t + transitionTime);
      f4.frequency.linearRampToValueAtTime(vowel.f4, t + transitionTime);

      // Amplitude envelope per syllable — stressed/unstressed rhythm
      const isStressed = Math.random() > 0.5;
      const level = isStressed ? syllableLevel : syllableLevel * 0.5;

      g1.gain.linearRampToValueAtTime(level * 1.0, t + 0.02);
      g2.gain.linearRampToValueAtTime(level * 0.6, t + 0.02);
      g3.gain.linearRampToValueAtTime(level * 0.3, t + 0.02);
      g4.gain.linearRampToValueAtTime(level * 0.15, t + 0.02);

      // Inter-syllable dip
      const dipTime = t + syllableDur * 0.7;
      g1.gain.linearRampToValueAtTime(level * 0.1, dipTime);
      g2.gain.linearRampToValueAtTime(level * 0.05, dipTime);
      g3.gain.linearRampToValueAtTime(level * 0.02, dipTime);
      g4.gain.linearRampToValueAtTime(level * 0.01, dipTime);
    }

    // Fade out at end of utterance
    g1.gain.linearRampToValueAtTime(0, now + duration);
    g2.gain.linearRampToValueAtTime(0, now + duration);
    g3.gain.linearRampToValueAtTime(0, now + duration);
    g4.gain.linearRampToValueAtTime(0, now + duration);

    const nextIn = (duration + 0.5 + Math.random() * 4) * 1000;
    setTimeout(burst, nextIn);
  }

  setTimeout(burst, 500 + Math.random() * 2000);
  g1._cleanup = () => { active = false; };
}

/**
 * Mechanical shutter clicks for Snapshots gallery.
 * Three-part model:
 * 1. Mirror slap — square wave burst (the mechanical clack)
 * 2. Curtain travel — noise transient (fabric/metal sliding)
 * 3. Mirror return — softer square wave burst
 */
function scheduleMechanicalShutterClicks(parentGain) {
  let active = true;

  function click() {
    if (!active || !audioCtx || audioCtx.state === 'closed') return;
    const now = audioCtx.currentTime;

    // Variation per click — different cameras / distances
    const proximity = 0.5 + Math.random() * 0.5; // How close the camera sounds
    const cameraType = Math.random(); // Affects pitch character

    // --- Part 1: Mirror slap (square wave burst) ---
    const mirrorOsc = audioCtx.createOscillator();
    mirrorOsc.type = 'square';
    mirrorOsc.frequency.value = 180 + cameraType * 120; // 180-300 Hz
    const mirrorFilter = audioCtx.createBiquadFilter();
    mirrorFilter.type = 'bandpass';
    mirrorFilter.frequency.value = 800 + cameraType * 400;
    mirrorFilter.Q.value = 3;
    const mirrorGain = audioCtx.createGain();
    mirrorGain.gain.setValueAtTime(0.07 * proximity, now);
    mirrorGain.gain.exponentialRampToValueAtTime(0.001, now + 0.008);

    mirrorOsc.connect(mirrorFilter);
    mirrorFilter.connect(mirrorGain);
    mirrorGain.connect(parentGain);
    mirrorOsc.start(now);
    mirrorOsc.stop(now + 0.012);

    // --- Part 1b: Impact noise transient (the "click") ---
    const clickNoise = createNoiseSource();
    const clickHP = audioCtx.createBiquadFilter();
    clickHP.type = 'highpass';
    clickHP.frequency.value = 3000 + Math.random() * 2000;
    const clickGain = audioCtx.createGain();
    clickGain.gain.setValueAtTime(0.08 * proximity, now);
    clickGain.gain.exponentialRampToValueAtTime(0.001, now + 0.005);

    clickNoise.connect(clickHP);
    clickHP.connect(clickGain);
    clickGain.connect(parentGain);
    clickNoise.start(now);
    clickNoise.stop(now + 0.01);

    // --- Part 2: Curtain travel (short noise with characteristic color) ---
    const curtainDelay = 0.012 + Math.random() * 0.005;
    const curtainNoise = createNoiseSource();
    const curtainBP = audioCtx.createBiquadFilter();
    curtainBP.type = 'bandpass';
    curtainBP.frequency.value = 2000 + cameraType * 1000;
    curtainBP.Q.value = 1.5;
    const curtainGain = audioCtx.createGain();
    curtainGain.gain.setValueAtTime(0.001, now);
    curtainGain.gain.setValueAtTime(0.04 * proximity, now + curtainDelay);
    curtainGain.gain.exponentialRampToValueAtTime(0.001, now + curtainDelay + 0.02);

    curtainNoise.connect(curtainBP);
    curtainBP.connect(curtainGain);
    curtainGain.connect(parentGain);
    curtainNoise.start(now + curtainDelay);
    curtainNoise.stop(now + curtainDelay + 0.03);

    // --- Part 3: Mirror return (softer mechanical thud) ---
    const returnDelay = curtainDelay + 0.025 + Math.random() * 0.01;
    const returnOsc = audioCtx.createOscillator();
    returnOsc.type = 'square';
    returnOsc.frequency.value = 140 + cameraType * 80;
    const returnFilter = audioCtx.createBiquadFilter();
    returnFilter.type = 'lowpass';
    returnFilter.frequency.value = 600;
    returnFilter.Q.value = 2;
    const returnGain = audioCtx.createGain();
    returnGain.gain.setValueAtTime(0.001, now);
    returnGain.gain.setValueAtTime(0.04 * proximity, now + returnDelay);
    returnGain.gain.exponentialRampToValueAtTime(0.001, now + returnDelay + 0.01);

    returnOsc.connect(returnFilter);
    returnFilter.connect(returnGain);
    returnGain.connect(parentGain);
    returnOsc.start(now + returnDelay);
    returnOsc.stop(now + returnDelay + 0.015);

    const nextIn = 3000 + Math.random() * 8000;
    setTimeout(click, nextIn);
  }

  setTimeout(click, 2000 + Math.random() * 4000);
  parentGain._clickCleanup = () => { active = false; };
}

// ============================================
// MODAL RESONANCE — subtle tonal ping when a photo opens
// ============================================
function playModalPing() {
  if (!audioCtx || audioCtx.state !== 'running') return;

  const now = audioCtx.currentTime;
  const gallery = store.get('currentGallery');
  const freqMap = {
    low: [220, 330, 440],
    r: [523, 659, 784],
    sa: [147, 196, 294],
    sol: [392, 494, 587]
  };
  const freqs = freqMap[gallery] || freqMap.low;
  const freq = freqs[Math.floor(Math.random() * freqs.length)];

  const osc = audioCtx.createOscillator();
  osc.type = 'sine';
  osc.frequency.value = freq;

  const pingGain = audioCtx.createGain();
  pingGain.gain.setValueAtTime(0.06, now);
  pingGain.gain.exponentialRampToValueAtTime(0.001, now + 1.2);

  const delay = audioCtx.createDelay();
  delay.delayTime.value = 0.15;
  const delayGain = audioCtx.createGain();
  delayGain.gain.value = 0.3;

  osc.connect(pingGain);
  pingGain.connect(masterGain);
  pingGain.connect(delay);
  delay.connect(delayGain);
  delayGain.connect(masterGain);

  osc.start(now);
  osc.stop(now + 1.5);
}

// ============================================
// SOUNDSCAPE FACTORY MAP
// ============================================
const scapeFactories = {
  low: createWindowsScape,
  r: createReflectionsScape,
  sa: createStreetArtScape,
  sol: createSnapshotsScape
};

// ============================================
// CORE: Initialize AudioContext (must be called from user gesture)
// ============================================
function ensureAudioContext() {
  if (audioCtx) return audioCtx;
  audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  masterGain = audioCtx.createGain();
  masterGain.gain.value = MASTER_VOLUME;
  masterGain.connect(audioCtx.destination);
  return audioCtx;
}

// ============================================
// CORE: Transition between soundscapes
// ============================================
function transitionTo(galleryId) {
  if (!audioCtx || !isAudioEnabled) return;
  if (currentScape?.galleryId === galleryId) return;

  const factory = scapeFactories[galleryId];
  if (!factory) return;

  const now = audioCtx.currentTime;

  // Fade out current scape
  if (currentScape) {
    const oldGain = currentScape.gainNode;
    const oldNodes = currentScape.nodes;
    oldGain.gain.setValueAtTime(oldGain.gain.value, now);
    oldGain.gain.linearRampToValueAtTime(0, now + CROSSFADE_DURATION);

    setTimeout(() => {
      oldNodes.forEach(n => {
        try { n.stop?.(); } catch (_) { /* already stopped */ }
        try { n.disconnect?.(); } catch (_) { /* ok */ }
      });
      oldGain.disconnect();
    }, (CROSSFADE_DURATION + 0.5) * 1000);
  }

  // Create and fade in new scape
  const newScape = factory();
  newScape.gainNode.gain.setValueAtTime(0, now);
  newScape.gainNode.gain.linearRampToValueAtTime(1, now + CROSSFADE_DURATION);
  currentScape = newScape;
}

// ============================================
// CORE: Stop all audio
// ============================================
function stopAll() {
  if (currentScape) {
    const now = audioCtx?.currentTime || 0;
    try {
      currentScape.gainNode.gain.setValueAtTime(currentScape.gainNode.gain.value, now);
      currentScape.gainNode.gain.linearRampToValueAtTime(0, now + 0.5);
    } catch (_) { /* context may be closed */ }

    setTimeout(() => {
      currentScape?.nodes?.forEach(n => {
        try { n.stop?.(); } catch (_) {}
        try { n.disconnect?.(); } catch (_) {}
      });
      currentScape?.gainNode?.disconnect?.();
      currentScape = null;
    }, 600);
  }
}

// ============================================
// CORE: Duck/restore volume for modal
// ============================================
function duckForModal() {
  if (!masterGain || !audioCtx) return;
  const now = audioCtx.currentTime;
  masterGain.gain.setValueAtTime(masterGain.gain.value, now);
  masterGain.gain.linearRampToValueAtTime(MASTER_VOLUME * MODAL_DUCK_LEVEL, now + MODAL_DUCK_TIME);
}

function restoreFromDuck() {
  if (!masterGain || !audioCtx) return;
  const now = audioCtx.currentTime;
  masterGain.gain.setValueAtTime(masterGain.gain.value, now);
  masterGain.gain.linearRampToValueAtTime(MASTER_VOLUME, now + MODAL_DUCK_TIME);
}

// ============================================
// TOGGLE: Enable/disable audio
// ============================================
function toggleAudio() {
  if (!isUserActivated) {
    ensureAudioContext();
    isUserActivated = true;
  }

  isAudioEnabled = !isAudioEnabled;
  store.set('isAudioEnabled', isAudioEnabled);
  updateToggleUI();

  if (isAudioEnabled) {
    if (audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
    if (store.get('isGalleryOpen')) {
      transitionTo(store.get('currentGallery'));
    }
  } else {
    stopAll();
  }
}

// ============================================
// UI: Update the toggle button appearance
// ============================================
function updateToggleUI() {
  const btn = dom.audioToggle;
  if (!btn) return;

  const icon = btn.querySelector('.audio-icon');
  const label = btn.querySelector('.audio-label');

  if (isAudioEnabled) {
    if (icon) icon.textContent = '♪';
    if (label) label.textContent = 'Sound On';
    btn.classList.add('audio-active');
    btn.classList.remove('audio-muted');
    btn.setAttribute('aria-label', 'Mute ambient sound');
  } else {
    if (icon) icon.textContent = '♪';
    if (label) label.textContent = 'Sound Off';
    btn.classList.remove('audio-active');
    btn.classList.add('audio-muted');
    btn.setAttribute('aria-label', 'Enable ambient sound');
  }
}

// ============================================
// EVENT SUBSCRIPTIONS
// ============================================
function subscribeToEvents() {
  busUnsubs.push(
    bus.on('gallery:open', (galleryId) => {
      if (isAudioEnabled && audioCtx) {
        transitionTo(galleryId);
      }
    })
  );

  busUnsubs.push(
    bus.on('gallery:close', () => {
      if (currentScape) {
        stopAll();
      }
    })
  );

  busUnsubs.push(
    bus.on('photo:select', () => {
      if (isAudioEnabled && audioCtx) {
        duckForModal();
        playModalPing();
      }
    })
  );

  busUnsubs.push(
    bus.on('modal:close', () => {
      if (isAudioEnabled && audioCtx) {
        restoreFromDuck();
      }
    })
  );
}

// ============================================
// BOOTSTRAP: Start AudioContext on first user gesture
// ============================================
let gestureCleanup = null;

function bootstrapOnGesture() {
  if (isUserActivated) return;

  function handleGesture() {
    if (isUserActivated) return;
    isUserActivated = true;

    if (gestureCleanup) {
      gestureCleanup();
      gestureCleanup = null;
    }

    if (!isAudioEnabled) return;

    ensureAudioContext();
    if (audioCtx.state === 'suspended') {
      audioCtx.resume();
    }

    if (store.get('isGalleryOpen')) {
      transitionTo(store.get('currentGallery'));
    }

    console.log('🔊 Audio bootstrapped on user gesture');
  }

  document.addEventListener('click', handleGesture, { once: true });
  document.addEventListener('touchstart', handleGesture, { once: true });

  gestureCleanup = () => {
    document.removeEventListener('click', handleGesture);
    document.removeEventListener('touchstart', handleGesture);
  };
}

// ============================================
// PUBLIC: Init
// ============================================
export function initAudio() {
  console.log('🔊 Initializing audio synesthesia module...');

  const btn = dom.audioToggle;
  if (btn) {
    btn.addEventListener('click', toggleAudio);
  }

  updateToggleUI();
  subscribeToEvents();

  if (isAudioEnabled) {
    bootstrapOnGesture();
  }
}

// ============================================
// PUBLIC: Cleanup
// ============================================
export function destroyAudio() {
  stopAll();
  busUnsubs.forEach(unsub => unsub());
  busUnsubs.length = 0;
  if (gestureCleanup) {
    gestureCleanup();
    gestureCleanup = null;
  }
  if (audioCtx && audioCtx.state !== 'closed') {
    audioCtx.close();
  }
  audioCtx = null;
  masterGain = null;
  currentScape = null;
  isAudioEnabled = false;
  isUserActivated = false;
}

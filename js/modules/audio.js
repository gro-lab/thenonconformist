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
// SOUNDSCAPE DEFINITIONS
// Each factory returns { nodes: [...AudioNodes], gainNode: GainNode }
// The gainNode is used for crossfading
// ============================================

/**
 * Language of Windows — Distant city hums, glass resonances
 * Warm, contemplative, slightly melancholic urban ambience
 */
function createWindowsScape() {
  const gain = audioCtx.createGain();
  gain.gain.value = 0;
  gain.connect(masterGain);
  const nodes = [];

  // 1. Distant city hum — layered low drones
  const cityHum = audioCtx.createOscillator();
  cityHum.type = 'sawtooth';
  cityHum.frequency.value = 55; // Low A
  const cityFilter = audioCtx.createBiquadFilter();
  cityFilter.type = 'lowpass';
  cityFilter.frequency.value = 120;
  cityFilter.Q.value = 2;
  const cityGain = audioCtx.createGain();
  cityGain.gain.value = 0.35;
  // Slow drift on the hum frequency
  const cityLFO = audioCtx.createOscillator();
  cityLFO.type = 'sine';
  cityLFO.frequency.value = 0.05;
  const cityLFOGain = audioCtx.createGain();
  cityLFOGain.gain.value = 3;
  cityLFO.connect(cityLFOGain);
  cityLFOGain.connect(cityHum.frequency);
  cityHum.connect(cityFilter);
  cityFilter.connect(cityGain);
  cityGain.connect(gain);
  cityHum.start();
  cityLFO.start();
  nodes.push(cityHum, cityLFO);

  // 2. Second harmonic drone (fifth above)
  const drone2 = audioCtx.createOscillator();
  drone2.type = 'sine';
  drone2.frequency.value = 82.5; // E below middle
  const drone2Filter = audioCtx.createBiquadFilter();
  drone2Filter.type = 'lowpass';
  drone2Filter.frequency.value = 200;
  const drone2Gain = audioCtx.createGain();
  drone2Gain.gain.value = 0.15;
  drone2.connect(drone2Filter);
  drone2Filter.connect(drone2Gain);
  drone2Gain.connect(gain);
  drone2.start();
  nodes.push(drone2);

  // 3. Glass resonance — high-frequency shimmer with filtered noise
  const glassNoise = createNoiseSource();
  const glassFilter = audioCtx.createBiquadFilter();
  glassFilter.type = 'bandpass';
  glassFilter.frequency.value = 3200;
  glassFilter.Q.value = 30;
  const glassGain = audioCtx.createGain();
  glassGain.gain.value = 0.04;
  // Slowly sweep the glass frequency
  const glassLFO = audioCtx.createOscillator();
  glassLFO.type = 'sine';
  glassLFO.frequency.value = 0.08;
  const glassLFOGain = audioCtx.createGain();
  glassLFOGain.gain.value = 800;
  glassLFO.connect(glassLFOGain);
  glassLFOGain.connect(glassFilter.frequency);
  glassNoise.connect(glassFilter);
  glassFilter.connect(glassGain);
  glassGain.connect(gain);
  glassNoise.start();
  glassLFO.start();
  nodes.push(glassNoise, glassLFO);

  // 4. Wind through gaps — occasional breathy noise
  const windNoise = createNoiseSource();
  const windFilter = audioCtx.createBiquadFilter();
  windFilter.type = 'bandpass';
  windFilter.frequency.value = 800;
  windFilter.Q.value = 1.5;
  const windGain = audioCtx.createGain();
  windGain.gain.value = 0;
  windNoise.connect(windFilter);
  windFilter.connect(windGain);
  windGain.connect(gain);
  windNoise.start();
  nodes.push(windNoise);

  // Modulate wind in/out with slow irregular breathing
  scheduleWindGusts(windGain, windFilter);

  return { nodes, gainNode: gain, galleryId: 'low' };
}

/**
 * Reflections — Water droplets, reversed reverb, shimmering ambience
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
  // Wobble like underwater
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

  // 2. Reversed reverb wash — noise with slow attack envelope cycling
  const reverbNoise = createNoiseSource();
  const reverbFilter = audioCtx.createBiquadFilter();
  reverbFilter.type = 'bandpass';
  reverbFilter.frequency.value = 1200;
  reverbFilter.Q.value = 0.8;
  const reverbGain = audioCtx.createGain();
  reverbGain.gain.value = 0;
  reverbNoise.connect(reverbFilter);
  reverbFilter.connect(reverbGain);
  reverbGain.connect(gain);
  reverbNoise.start();
  nodes.push(reverbNoise);

  // Cycle reversed-reverb swells
  scheduleReversedSwells(reverbGain, reverbFilter);

  // 3. Water droplets — scheduled sine pings with natural variation
  scheduleDroplets(gain);

  // 4. High shimmer — very gentle high-frequency bed
  const shimmer = createNoiseSource();
  const shimmerFilter = audioCtx.createBiquadFilter();
  shimmerFilter.type = 'highpass';
  shimmerFilter.frequency.value = 6000;
  const shimmerGain = audioCtx.createGain();
  shimmerGain.gain.value = 0.015;
  const shimmerLFO = audioCtx.createOscillator();
  shimmerLFO.type = 'sine';
  shimmerLFO.frequency.value = 0.03;
  const shimmerLFOGain = audioCtx.createGain();
  shimmerLFOGain.gain.value = 0.01;
  shimmerLFO.connect(shimmerLFOGain);
  shimmerLFOGain.connect(shimmerGain.gain);
  shimmer.connect(shimmerFilter);
  shimmerFilter.connect(shimmerGain);
  shimmerGain.connect(gain);
  shimmer.start();
  shimmerLFO.start();
  nodes.push(shimmer, shimmerLFO);

  return { nodes, gainNode: gain, galleryId: 'r' };
}

/**
 * Street Art — Spray can hiss, urban bass, gritty energy
 * Energetic, raw, rhythmic urban pulse
 */
function createStreetArtScape() {
  const gain = audioCtx.createGain();
  gain.gain.value = 0;
  gain.connect(masterGain);
  const nodes = [];

  // 1. Urban sub-bass — slow pulsing low frequency
  const subBass = audioCtx.createOscillator();
  subBass.type = 'sine';
  subBass.frequency.value = 40;
  const subBassFilter = audioCtx.createBiquadFilter();
  subBassFilter.type = 'lowpass';
  subBassFilter.frequency.value = 80;
  const subBassGain = audioCtx.createGain();
  subBassGain.gain.value = 0.3;
  // Slow rhythmic pulse
  const bassLFO = audioCtx.createOscillator();
  bassLFO.type = 'sine';
  bassLFO.frequency.value = 0.25; // Slow pulse
  const bassLFOGain = audioCtx.createGain();
  bassLFOGain.gain.value = 0.15;
  bassLFO.connect(bassLFOGain);
  bassLFOGain.connect(subBassGain.gain);
  subBass.connect(subBassFilter);
  subBassFilter.connect(subBassGain);
  subBassGain.connect(gain);
  subBass.start();
  bassLFO.start();
  nodes.push(subBass, bassLFO);

  // 2. Spray can hiss — bandpass-filtered noise with sputtery modulation
  const sprayNoise = createNoiseSource();
  const sprayFilter = audioCtx.createBiquadFilter();
  sprayFilter.type = 'bandpass';
  sprayFilter.frequency.value = 5500;
  sprayFilter.Q.value = 2.0;
  const sprayGain = audioCtx.createGain();
  sprayGain.gain.value = 0;
  sprayNoise.connect(sprayFilter);
  sprayFilter.connect(sprayGain);
  sprayGain.connect(gain);
  sprayNoise.start();
  nodes.push(sprayNoise);

  // Schedule spray bursts
  scheduleSprayBursts(sprayGain, sprayFilter);

  // 3. Gritty mid-range — distorted filtered noise for texture
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

  // 4. Distant traffic rumble
  const trafficNoise = createNoiseSource();
  const trafficFilter = audioCtx.createBiquadFilter();
  trafficFilter.type = 'lowpass';
  trafficFilter.frequency.value = 200;
  trafficFilter.Q.value = 0.5;
  const trafficGain = audioCtx.createGain();
  trafficGain.gain.value = 0.08;
  const trafficLFO = audioCtx.createOscillator();
  trafficLFO.type = 'sine';
  trafficLFO.frequency.value = 0.07;
  const trafficLFOGain = audioCtx.createGain();
  trafficLFOGain.gain.value = 0.04;
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
 * Snapshots of Life — Shutter clicks, muffled conversations, city presence
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
  roomTone.frequency.value = 60; // Mains hum frequency
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

  // 2. Muffled conversations — modulated noise that mimics speech cadence
  const convNoise = createNoiseSource();
  const convFilter1 = audioCtx.createBiquadFilter();
  convFilter1.type = 'bandpass';
  convFilter1.frequency.value = 600;
  convFilter1.Q.value = 2;
  const convFilter2 = audioCtx.createBiquadFilter();
  convFilter2.type = 'lowpass';
  convFilter2.frequency.value = 1800;
  const convGain = audioCtx.createGain();
  convGain.gain.value = 0;
  convNoise.connect(convFilter1);
  convFilter1.connect(convFilter2);
  convFilter2.connect(convGain);
  convGain.connect(gain);
  convNoise.start();
  nodes.push(convNoise);

  // Modulate conversation levels with speech-like rhythm
  scheduleConversationBursts(convGain, convFilter1);

  // 3. Shutter clicks — scheduled percussive bursts
  scheduleShutterClicks(gain);

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
// UTILITY: Noise source generator
// ============================================
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

// ============================================
// UTILITY: Distortion curve for waveshaper
// ============================================
function makeDistortionCurve(amount) {
  const samples = 256;
  const curve = new Float32Array(samples);
  for (let i = 0; i < samples; i++) {
    const x = (i * 2) / samples - 1;
    curve[i] = ((Math.PI + amount) * x) / (Math.PI + amount * Math.abs(x));
  }
  return curve;
}

// ============================================
// SCHEDULED TEXTURE GENERATORS
// These use setTimeout loops to create organic, non-repeating textures
// ============================================

/** Wind gusts for Windows gallery */
function scheduleWindGusts(windGain, windFilter) {
  let active = true;

  function gust() {
    if (!active || !audioCtx || audioCtx.state === 'closed') return;
    const now = audioCtx.currentTime;
    const duration = 2 + Math.random() * 4;
    const intensity = 0.02 + Math.random() * 0.04;
    const freq = 400 + Math.random() * 800;

    windFilter.frequency.setValueAtTime(freq, now);
    windGain.gain.setValueAtTime(0, now);
    windGain.gain.linearRampToValueAtTime(intensity, now + duration * 0.3);
    windGain.gain.linearRampToValueAtTime(intensity * 0.6, now + duration * 0.7);
    windGain.gain.linearRampToValueAtTime(0, now + duration);

    const nextIn = (duration + 1 + Math.random() * 5) * 1000;
    setTimeout(gust, nextIn);
  }

  setTimeout(gust, 2000 + Math.random() * 3000);

  // Return cleanup
  windGain._cleanup = () => { active = false; };
}

/** Reversed reverb swells for Reflections gallery */
function scheduleReversedSwells(reverbGain, reverbFilter) {
  let active = true;

  function swell() {
    if (!active || !audioCtx || audioCtx.state === 'closed') return;
    const now = audioCtx.currentTime;
    const duration = 3 + Math.random() * 4;
    const peak = 0.06 + Math.random() * 0.04;
    const freq = 800 + Math.random() * 1200;

    reverbFilter.frequency.setValueAtTime(freq, now);
    // Reversed envelope: slow build, sudden cut
    reverbGain.gain.setValueAtTime(0, now);
    reverbGain.gain.exponentialRampToValueAtTime(peak, now + duration * 0.85);
    reverbGain.gain.linearRampToValueAtTime(0.001, now + duration * 0.88);
    reverbGain.gain.setValueAtTime(0, now + duration * 0.9);

    const nextIn = (duration + 2 + Math.random() * 6) * 1000;
    setTimeout(swell, nextIn);
  }

  setTimeout(swell, 1500);
  reverbGain._cleanup = () => { active = false; };
}

/** Water droplets for Reflections gallery */
function scheduleDroplets(parentGain) {
  let active = true;

  function droplet() {
    if (!active || !audioCtx || audioCtx.state === 'closed') return;

    const now = audioCtx.currentTime;
    const freq = 1800 + Math.random() * 3000;
    const osc = audioCtx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, now);
    osc.frequency.exponentialRampToValueAtTime(freq * 0.6, now + 0.12);

    const dropGain = audioCtx.createGain();
    dropGain.gain.setValueAtTime(0.06 + Math.random() * 0.05, now);
    dropGain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);

    osc.connect(dropGain);
    dropGain.connect(parentGain);
    osc.start(now);
    osc.stop(now + 0.2);

    // Sometimes add a harmonic "ripple"
    if (Math.random() > 0.5) {
      const ripple = audioCtx.createOscillator();
      ripple.type = 'sine';
      ripple.frequency.value = freq * 0.75;
      const rippleGain = audioCtx.createGain();
      rippleGain.gain.setValueAtTime(0.02, now + 0.08);
      rippleGain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
      ripple.connect(rippleGain);
      rippleGain.connect(parentGain);
      ripple.start(now + 0.08);
      ripple.stop(now + 0.3);
    }

    const nextIn = 400 + Math.random() * 2500;
    setTimeout(droplet, nextIn);
  }

  setTimeout(droplet, 800);
  parentGain._dropletCleanup = () => { active = false; };
}

/** Spray can bursts for Street Art gallery */
function scheduleSprayBursts(sprayGain, sprayFilter) {
  let active = true;

  function spray() {
    if (!active || !audioCtx || audioCtx.state === 'closed') return;
    const now = audioCtx.currentTime;
    const duration = 0.3 + Math.random() * 1.5;
    const intensity = 0.04 + Math.random() * 0.06;
    const freq = 4000 + Math.random() * 4000;

    sprayFilter.frequency.setValueAtTime(freq, now);
    sprayGain.gain.setValueAtTime(0, now);
    // Quick attack, sustain, quick release — like a spray stroke
    sprayGain.gain.linearRampToValueAtTime(intensity, now + 0.02);
    sprayGain.gain.setValueAtTime(intensity * (0.6 + Math.random() * 0.4), now + duration * 0.5);
    sprayGain.gain.linearRampToValueAtTime(0, now + duration);

    const nextIn = (duration + 1.5 + Math.random() * 5) * 1000;
    setTimeout(spray, nextIn);
  }

  setTimeout(spray, 1000 + Math.random() * 2000);
  sprayGain._cleanup = () => { active = false; };
}

/** Muffled conversation bursts for Snapshots gallery */
function scheduleConversationBursts(convGain, convFilter) {
  let active = true;

  function burst() {
    if (!active || !audioCtx || audioCtx.state === 'closed') return;
    const now = audioCtx.currentTime;
    const duration = 1.5 + Math.random() * 3;
    const intensity = 0.03 + Math.random() * 0.03;
    const freq = 400 + Math.random() * 500;

    convFilter.frequency.setValueAtTime(freq, now);

    // Speech-like: variable amplitude within the burst
    convGain.gain.setValueAtTime(0, now);
    const steps = 4 + Math.floor(Math.random() * 4);
    for (let i = 0; i < steps; i++) {
      const t = now + (duration * i) / steps;
      const val = intensity * (0.3 + Math.random() * 0.7);
      convGain.gain.linearRampToValueAtTime(val, t + 0.05);
    }
    convGain.gain.linearRampToValueAtTime(0, now + duration);

    const nextIn = (duration + 0.5 + Math.random() * 4) * 1000;
    setTimeout(burst, nextIn);
  }

  setTimeout(burst, 500 + Math.random() * 2000);
  convGain._cleanup = () => { active = false; };
}

/** Shutter click sounds for Snapshots gallery */
function scheduleShutterClicks(parentGain) {
  let active = true;

  function click() {
    if (!active || !audioCtx || audioCtx.state === 'closed') return;
    const now = audioCtx.currentTime;

    // Shutter is a short noise burst with sharp attack — two parts (mirror slap + curtain)
    const clickNoise = createNoiseSource();
    const clickFilter = audioCtx.createBiquadFilter();
    clickFilter.type = 'highpass';
    clickFilter.frequency.value = 2000 + Math.random() * 2000;
    const clickGain = audioCtx.createGain();

    // Part 1: sharp transient
    clickGain.gain.setValueAtTime(0.08 + Math.random() * 0.06, now);
    clickGain.gain.exponentialRampToValueAtTime(0.001, now + 0.015);
    // Part 2: mechanical follow-through
    clickGain.gain.setValueAtTime(0.04, now + 0.03);
    clickGain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);

    clickNoise.connect(clickFilter);
    clickFilter.connect(clickGain);
    clickGain.connect(parentGain);
    clickNoise.start(now);
    clickNoise.stop(now + 0.1);

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
  // Choose frequency based on gallery character
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

  // Add subtle reverb-like delay
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

    // Schedule cleanup after fade
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
    // First activation — create AudioContext inside user gesture
    ensureAudioContext();
    isUserActivated = true;
  }

  isAudioEnabled = !isAudioEnabled;
  store.set('isAudioEnabled', isAudioEnabled);
  localStorage.setItem('audioEnabled', isAudioEnabled); // persist preference
  updateToggleUI();

  if (isAudioEnabled) {
    // Resume context if suspended (browser autoplay policy)
    if (audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
    // If a gallery is currently open, start its soundscape
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
  // Gallery opened — start or transition soundscape
  busUnsubs.push(
    bus.on('gallery:open', (galleryId) => {
      if (isAudioEnabled && audioCtx) {
        transitionTo(galleryId);
      }
    })
  );

  // Gallery closed — fade out
  busUnsubs.push(
    bus.on('gallery:close', () => {
      if (currentScape) {
        stopAll();
      }
    })
  );

  // Photo selected — duck volume and play ping
  busUnsubs.push(
    bus.on('photo:select', () => {
      if (isAudioEnabled && audioCtx) {
        duckForModal();
        playModalPing();
      }
    })
  );

  // Modal closed — restore volume
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
// Browsers require a user gesture to create/resume AudioContext.
// Since audio is on by default, we listen for the first click/touch
// anywhere on the page, then bootstrap the context and start playing.
// ============================================
let gestureCleanup = null;

function bootstrapOnGesture() {
  if (isUserActivated) return;

  function handleGesture() {
    if (isUserActivated) return;
    isUserActivated = true;

    // Remove listeners
    if (gestureCleanup) {
      gestureCleanup();
      gestureCleanup = null;
    }

    if (!isAudioEnabled) return;

    ensureAudioContext();
    if (audioCtx.state === 'suspended') {
      audioCtx.resume();
    }

    // If a gallery is already open, start its soundscape
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

  // Restore saved preference — essential UI storage, no consent needed
  const saved = localStorage.getItem('audioEnabled');
  if (saved !== null) isAudioEnabled = saved === 'true';

  // Setup toggle button listener
  const btn = dom.audioToggle;
  if (btn) {
    btn.addEventListener('click', toggleAudio);
  }

  updateToggleUI();
  subscribeToEvents();

  // If audio is enabled, wait for first user gesture to bootstrap
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

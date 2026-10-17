/**
 * Web Audio API Acoustic Synthesizer for Clinical Telemetry
 *
 * Implements a gentle, non-jarring acoustic medical chime for NICU monitoring.
 * Design principles:
 * - Pure sine harmonics with soft linear attack (prevents clicks/pops)
 * - Smooth exponential decay mimicking warm acoustic bells
 * - Gentle clinical presence without inducing alarm fatigue or neonatal distress
 * - Respectful 3.5s pulse interval instead of rapid aggressive buzzing
 */

let audioCtx = null;
let alarmInterval = null;
let isMuted = false;

function getContext() {
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (AudioContextClass) {
      audioCtx = new AudioContextClass();
    }
  }
  if (audioCtx && audioCtx.state === "suspended") {
    audioCtx.resume().catch(() => {});
  }
  return audioCtx;
}

export function setAlarmMuted(muted) {
  isMuted = muted;
  if (muted && alarmInterval) {
    stopEmergencyAlarm();
  }
}

export function isAlarmMuted() {
  return isMuted;
}

/**
 * Plays a single gentle two-tone harmonic medical chime.
 * @param {boolean} isPriority True for clinical priority chime (F5 -> A5), False for advisory chime (E5 -> G5)
 */
export function playGentleChime(isPriority = true) {
  if (isMuted) return;
  try {
    const ctx = getContext();
    if (!ctx || ctx.state !== "running") return;

    const now = ctx.currentTime;
    const freq1 = isPriority ? 698.46 : 523.25; // F5 vs C5
    const freq2 = isPriority ? 880.00 : 659.25; // A5 vs E5
    const peakGain = isPriority ? 0.09 : 0.06;

    // First soft harmonic bell
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = "sine";
    osc1.frequency.setValueAtTime(freq1, now);
    gain1.gain.setValueAtTime(0.001, now);
    gain1.gain.linearRampToValueAtTime(peakGain, now + 0.04);
    gain1.gain.exponentialRampToValueAtTime(0.0008, now + 0.35);
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(now);
    osc1.stop(now + 0.36);

    // Second soft harmonic bell (gentle chord interval)
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = "sine";
    osc2.frequency.setValueAtTime(freq2, now + 0.16);
    gain2.gain.setValueAtTime(0.001, now + 0.16);
    gain2.gain.linearRampToValueAtTime(peakGain * 0.95, now + 0.20);
    gain2.gain.exponentialRampToValueAtTime(0.0008, now + 0.55);
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(now + 0.16);
    osc2.stop(now + 0.56);
  } catch (err) {
    console.warn("[audioAlarm] Gentle chime error:", err);
  }
}

export function playEmergencyAlarm() {
  if (isMuted) return;
  if (alarmInterval) return; // Already pulsing gently

  try {
    playGentleChime(true);
    // Respectful 3.5s interval to inform clinicians calmly without sensory overload
    alarmInterval = setInterval(() => {
      playGentleChime(true);
    }, 3500);
  } catch (e) {
    console.warn("[audioAlarm] Playback error:", e);
  }
}

export function stopEmergencyAlarm() {
  if (alarmInterval) {
    clearInterval(alarmInterval);
    alarmInterval = null;
  }
}

// Sparse, opt-in WebAudio cues for a quiet daily game. No audio files.

const SOUND_KEY = 'btown-rof-sound';
const AudioContextClass = window.AudioContext || window.webkitAudioContext;

let enabled = localStorage.getItem(SOUND_KEY) === 'on';
let context;
const liveVoices = new Set();

function ensureContext() {
  if (!enabled || !AudioContextClass) return null;
  if (!context) context = new AudioContextClass();
  if (context.state === 'suspended') context.resume().catch(() => {});
  return context;
}

function tone(frequency, delay, duration, volume, type = 'sine', endFrequency = frequency) {
  const ctx = ensureContext();
  if (!ctx || liveVoices.size >= 6) return;

  const start = ctx.currentTime + delay;
  const end = start + duration;
  const oscillator = ctx.createOscillator();
  const gain = ctx.createGain();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, start);
  oscillator.frequency.exponentialRampToValueAtTime(endFrequency, end);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(volume, start + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, end);
  oscillator.connect(gain);
  gain.connect(ctx.destination);
  liveVoices.add(oscillator);
  oscillator.onended = () => {
    oscillator.disconnect();
    gain.disconnect();
    liveVoices.delete(oscillator);
  };
  oscillator.start(start);
  oscillator.stop(end + 0.01);
}

function syncButton(button) {
  button.textContent = enabled ? '🔊' : '🔇';
  button.title = enabled ? 'Turn sound off' : 'Turn sound on';
  button.setAttribute('aria-label', button.title);
  button.setAttribute('aria-pressed', String(enabled));
}

export function initSoundToggle(button) {
  syncButton(button);
  button.addEventListener('click', () => {
    enabled = !enabled;
    localStorage.setItem(SOUND_KEY, enabled ? 'on' : 'off');
    syncButton(button);
    if (enabled) {
      ensureContext();
      tone(440, 0, 0.07, 0.025);
      tone(660, 0.06, 0.09, 0.02);
    }
  });
}

export function stopSounds() {
  for (const oscillator of liveVoices) {
    try { oscillator.stop(); } catch { /* already stopped */ }
  }
}

export function playSound(cue, level = 0) {
  if (!enabled) return;

  if (cue === 'stamp') {
    tone(105, 0, 0.11, 0.04, 'triangle', 72);
  } else if (cue === 'correct') {
    tone(440, 0, 0.1, 0.025);
    tone(587, 0.08, 0.13, 0.022);
  } else if (cue === 'wrong') {
    tone(190, 0, 0.16, 0.025, 'triangle', 145);
  } else if (cue === 'inversion') {
    tone(330, 0, 0.1, 0.025, 'square');
    tone(440, 0.11, 0.14, 0.022, 'square');
  } else if (cue === 'streak') {
    const notes = level >= 10 ? [440, 554, 659] : level >= 5 ? [392, 494] : [349, 440];
    notes.forEach((note, i) => tone(note, i * 0.07, 0.13, 0.022));
  } else if (cue === 'death') {
    tone(120, 0, 0.25, 0.035, 'triangle', 76);
  }
}

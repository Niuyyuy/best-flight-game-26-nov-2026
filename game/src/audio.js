// Sound, all of it synthesised live with WebAudio oscillators and filtered
// noise: no audio files, no copied sounds. The engine is a low hum whose
// pitch follows the throttle, a ring is a two-note chime, a landing is a
// short rising arpeggio, and a crash is a burst of noise. Everything is
// created lazily on the first user gesture, so the page never needs an
// autoplay permission it does not have.

export function createAudio() {
  let context = null;
  let engineOsc = null;
  let engineGain = null;
  let engineFilter = null;
  let windSource = null;
  let windGain = null;
  let windFilter = null;

  function ensure() {
    if (context) return true;
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return false;
      context = new AudioContext();
      engineOsc = context.createOscillator();
      engineOsc.type = 'sawtooth';
      engineOsc.frequency.value = 62;
      engineFilter = context.createBiquadFilter();
      engineFilter.type = 'lowpass';
      engineFilter.frequency.value = 320;
      engineGain = context.createGain();
      engineGain.gain.value = 0;
      engineOsc.connect(engineFilter);
      engineFilter.connect(engineGain);
      engineGain.connect(context.destination);
      engineOsc.start();
      // Wind: a loop of filtered noise whose level follows the airspeed.
      const windLength = context.sampleRate * 2;
      const windBuffer = context.createBuffer(1, windLength, context.sampleRate);
      const windData = windBuffer.getChannelData(0);
      for (let i = 0; i < windLength; i += 1) windData[i] = Math.random() * 2 - 1;
      windSource = context.createBufferSource();
      windSource.buffer = windBuffer;
      windSource.loop = true;
      windFilter = context.createBiquadFilter();
      windFilter.type = 'bandpass';
      windFilter.frequency.value = 700;
      windFilter.Q.value = 0.6;
      windGain = context.createGain();
      windGain.gain.value = 0;
      windSource.connect(windFilter);
      windFilter.connect(windGain);
      windGain.connect(context.destination);
      windSource.start();
      return true;
    } catch {
      return false;
    }
  }

  function tone(frequency, seconds, type, volume, when = 0) {
    if (!context) return;
    const start = context.currentTime + when;
    const osc = context.createOscillator();
    osc.type = type;
    osc.frequency.value = frequency;
    const gain = context.createGain();
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(volume, start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + seconds);
    osc.connect(gain);
    gain.connect(context.destination);
    osc.start(start);
    osc.stop(start + seconds + 0.05);
  }

  return {
    /** Call from a user gesture (start, click) so the context may run. */
    unlock() {
      if (ensure() && context.state === 'suspended') context.resume().catch(() => {});
    },
    /** The engine hum follows the throttle; 0 silences it. */
    engine(throttle, playing) {
      if (!ensure()) return;
      const target = playing ? 0.045 + throttle * 0.05 : 0;
      engineGain.gain.setTargetAtTime(target, context.currentTime, 0.15);
      engineOsc.frequency.setTargetAtTime(58 + throttle * 46, context.currentTime, 0.2);
      engineFilter.frequency.setTargetAtTime(280 + throttle * 420, context.currentTime, 0.2);
    },
    /** Wind rush: louder and higher with airspeed, silent when parked. */
    wind(speed, playing) {
      if (!ensure()) return;
      const level = playing ? Math.max(0, (speed - 40) / 140) * 0.05 : 0;
      windGain.gain.setTargetAtTime(level, context.currentTime, 0.3);
      windFilter.frequency.setTargetAtTime(500 + speed * 6, context.currentTime, 0.3);
    },
    ring(perfect) {
      if (!ensure()) return;
      tone(660, 0.22, 'sine', 0.16);
      tone(990, 0.3, 'sine', 0.14, 0.08);
      if (perfect) tone(1320, 0.34, 'sine', 0.12, 0.16);
    },
    land() {
      if (!ensure()) return;
      tone(523, 0.18, 'triangle', 0.16);
      tone(659, 0.18, 'triangle', 0.16, 0.12);
      tone(784, 0.3, 'triangle', 0.18, 0.24);
    },
    crash() {
      if (!ensure()) return;
      const length = Math.floor(context.sampleRate * 0.5);
      const buffer = context.createBuffer(1, length, context.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < length; i += 1) {
        data[i] = (Math.random() * 2 - 1) * (1 - i / length);
      }
      const source = context.createBufferSource();
      source.buffer = buffer;
      const filter = context.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 900;
      const gain = context.createGain();
      gain.gain.value = 0.35;
      source.connect(filter);
      filter.connect(gain);
      gain.connect(context.destination);
      source.start();
      tone(110, 0.5, 'sawtooth', 0.12);
    },
    fuelEmpty() {
      if (!ensure()) return;
      tone(440, 0.12, 'square', 0.08);
      tone(440, 0.12, 'square', 0.08, 0.18);
    },
  };
}

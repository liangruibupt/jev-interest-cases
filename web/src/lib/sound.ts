import { normalizeSoundMix, type SoundMix, type SoundScore } from "@jev/shared";

export async function renderSound(score: SoundScore, input: SoundMix): Promise<AudioBuffer> {
  const mix = normalizeSoundMix(input), sampleRate = 44100;
  const context = new OfflineAudioContext(2, Math.ceil((score.duration + 1.6) * sampleRate), sampleRate);
  const master = context.createGain(), filter = context.createBiquadFilter();
  master.gain.value = 0.55;
  filter.type = "lowpass"; filter.frequency.value = 500 + mix.brightness * 6500; filter.Q.value = 0.4;
  filter.connect(master); master.connect(context.destination);
  const note = (frequency: number, time: number, length: number, velocity: number, pan: number, type: OscillatorType, overtone = false) => {
    const oscillator = context.createOscillator(), gain = context.createGain(), stereo = context.createStereoPanner();
    oscillator.type = type; oscillator.frequency.value = frequency;
    const release = mix.timbre === "warm" ? 0.8 : 0.35;
    gain.gain.setValueAtTime(0, time);
    gain.gain.linearRampToValueAtTime(velocity, time + (mix.timbre === "warm" ? 0.045 : 0.012));
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, velocity * (overtone ? 0.12 : 0.45)), time + Math.max(0.06, length));
    gain.gain.exponentialRampToValueAtTime(0.0001, time + length + release);
    gain.gain.linearRampToValueAtTime(0, time + length + release + 0.025);
    stereo.pan.value = pan;
    oscillator.connect(gain); gain.connect(stereo); stereo.connect(filter);
    oscillator.start(time); oscillator.stop(time + length + release + 0.03);
  };
  for (const n of score.notes) {
    if (n.track === "drum") {
      const oscillator = context.createOscillator(), gain = context.createGain();
      oscillator.type = n.midi === 36 ? "sine" : "triangle";
      oscillator.frequency.setValueAtTime(n.midi === 36 ? 145 : 1700, n.time);
      oscillator.frequency.exponentialRampToValueAtTime(n.midi === 36 ? 45 : 450, n.time + 0.12);
      gain.gain.setValueAtTime(0, n.time);
      gain.gain.linearRampToValueAtTime(n.velocity, n.time + 0.004);
      gain.gain.exponentialRampToValueAtTime(0.0001, n.time + n.duration);
      oscillator.connect(gain); gain.connect(filter);
      oscillator.start(n.time); oscillator.stop(n.time + n.duration + 0.02);
      continue;
    }
    const frequency = 440 * 2 ** ((n.midi - 69) / 12);
    const type: OscillatorType = n.track === "bass" || mix.timbre !== "pluck" ? "sine" : "triangle";
    note(frequency, n.time, n.duration, n.velocity, n.pan, type);
    if (mix.timbre === "glass" && n.track === "melody")
      note(frequency * 2.003, n.time, n.duration * 0.65, n.velocity * 0.25, -n.pan, "sine", true);
  }
  const buffer = await context.startRendering();
  let peak = 0;
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    for (const v of buffer.getChannelData(ch)) {
      if (!Number.isFinite(v)) throw new Error("音频合成出现无效样本");
      peak = Math.max(peak, Math.abs(v));
    }
  }
  // A fixed gain preserves quiet presets; only attenuate unusually large peaks.
  if (peak > 0.82) for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const data = buffer.getChannelData(ch);
    for (let i = 0; i < data.length; i++) data[i] = data[i]! * 0.82 / peak;
  }
  return buffer;
}

import type { Answers, JevTrace, Questions } from "../../types";

export const C5_PRESETS = [
  { id: "rain", title: "雨夜车窗", brief: "Watching rain on the train window at midnight. Slow, warm, sparse notes with long spaces; no drums, calm rather than tense." },
  { id: "glass", title: "玻璃温室", brief: "Sunlight through a glass greenhouse. Bright bell-like notes, a playful and delicate pattern, medium energy, no percussion and no tension." },
  { id: "run", title: "夜跑脉冲", brief: "A quick night run through neon streets: a crisp plucked melody, driving percussion, dense patterns and controlled tension. 124 BPM." },
  { id: "orbit", title: "失重漂浮", brief: "Drifting weightlessly past distant stars. Glassy sustained tones, extremely slow and spacious, a slightly mysterious mood, absolutely no drums." },
] as const;

export const C5_QUESTIONS = {
  timbre: {
    type: "choice",
    instructions: "Which of the available synthesized timbres best matches the soundscape requested in `brief`? Interpret the imagery as an aesthetic preference, not as a request for literal recordings.",
    criteria: {
      warm: "Soft, rounded, mellow sustained tones with muted edges.",
      glass: "Clear bell-like tones with a delicate shimmering overtone.",
      pluck: "Crisp, short plucked notes with a distinct attack.",
    },
  },
  energy: {
    type: "score",
    instructions: "How energetic should the requested musical movement in `brief` feel? Judge movement, independently of brightness or note count.",
    criteria: [
      "Still, floating, meditative movement with almost no sense of urgency.",
      "Slow and relaxed movement, suitable for unwinding.",
      "A moderate, unhurried walking pulse.",
      "Lively forward movement, suitable for brisk activity.",
      "Fast, driving movement with an urgent, highly active pulse.",
    ],
  },
  brightness: {
    type: "score",
    instructions: "How bright should the sound's tone color be for `brief`, independently of its energy?",
    criteria: [
      "Dark, heavily muted tone with almost no sparkling high frequencies.",
      "Warm, soft tone with restrained upper frequencies.",
      "Balanced tone, neither especially dark nor sparkling.",
      "Clear and bright tone with audible sparkle.",
      "Brilliant, crystalline, very sparkling tone.",
    ],
  },
  density: {
    type: "score",
    instructions: "How densely packed should the musical notes in `brief` be, independently of their speed?",
    criteria: [
      "Isolated notes separated by large spaces of silence.",
      "A sparse pattern with frequent gaps.",
      "A simple steady pattern with breathing room.",
      "A busy pattern with many notes and few gaps.",
      "A densely filled sequence with continuous note activity.",
    ],
  },
  tension: {
    type: "score",
    instructions: "How much emotional suspense or tension should the music evoke according to `brief`?",
    criteria: [
      "Settled, reassuring and peaceful, with no suspense.",
      "Mostly comfortable, with a trace of anticipation.",
      "Ambiguous or mildly mysterious, without alarm.",
      "Suspenseful and unsettled, expecting something to happen.",
      "Strongly tense and ominous, with a persistent sense of unease.",
    ],
  },
  percussion: {
    type: "noul",
    instructions: "Does the requested soundscape in `brief` call for audible percussion or drum beats? Explicitly requesting no drums or no percussion means no, even if the imagery contains movement.",
  },
  silence: {
    type: "noul",
    instructions: "Does `brief` explicitly ask for complete silence or no sound at all? Quiet, soft, calm music or gaps between notes do not mean complete silence.",
  },
} satisfies Questions;

export type SoundTimbre = "warm" | "glass" | "pluck";
export interface SoundMix {
  timbre: SoundTimbre;
  energy: number;
  brightness: number;
  density: number;
  tension: number;
  bpm: number;
  percussion: boolean;
  silence: boolean;
}
export const C5_DEFAULT_MIX: SoundMix = {
  timbre: "warm", energy: 0.3, brightness: 0.4, density: 0.35, tension: 0.2,
  bpm: 84, percussion: false, silence: false,
};
export const C5_THRESHOLDS = { percussion: 0.65, silence: 0.7 } as const;
export const C5_LIMITS = { minChars: 5, maxChars: 1500, minBpm: 55, maxBpm: 150 } as const;
export const buildC5State = (brief: string) => ({ brief: brief.trim() });

function unit(value: number): number {
  if (!Number.isFinite(value)) throw new Error("音乐参数必须是有限数值");
  return Math.max(0, Math.min(1, value));
}

export function normalizeSoundMix(mix: Readonly<SoundMix>): SoundMix {
  if (!["warm", "glass", "pluck"].includes(mix.timbre)) throw new Error("未知音色");
  if (!Number.isFinite(mix.bpm)) throw new Error("无效 BPM");
  return {
    ...mix,
    energy: unit(mix.energy), brightness: unit(mix.brightness),
    density: unit(mix.density), tension: unit(mix.tension),
    bpm: Math.max(C5_LIMITS.minBpm, Math.min(C5_LIMITS.maxBpm, Math.round(mix.bpm))),
    percussion: Boolean(mix.percussion), silence: Boolean(mix.silence),
  };
}

export function explicitBpm(brief: string): number | null {
  const match = brief.match(/\b(\d{2,3}(?:\.\d+)?)\s*(?:bpm|beats per minute)\b/i);
  return match ? Math.max(C5_LIMITS.minBpm, Math.min(C5_LIMITS.maxBpm, Math.round(Number(match[1])))) : null;
}

export function soundMixFromAnswers(answers: Answers, brief: string): SoundMix {
  const score = (id: string) => {
    const a = answers[id];
    if (!a || a.type !== "score" || !Number.isFinite(a.score) || a.score < 0 || a.score > 4)
      throw new Error(`Jev 返回了无效的 ${id} Score`);
    return a.score / 4;
  };
  const noul = (id: string) => {
    const a = answers[id];
    if (!a || a.type !== "noul" || !Number.isFinite(a.noul) || a.noul < 0 || a.noul > 1)
      throw new Error(`Jev 返回了无效的 ${id} Noul`);
    return a.noul;
  };
  const timbre = answers.timbre;
  if (!timbre || timbre.type !== "choice" || !["warm", "glass", "pluck"].includes(timbre.choice))
    throw new Error("Jev 返回了未知音色");
  const energy = score("energy");
  return normalizeSoundMix({
    timbre: timbre.choice as SoundTimbre,
    energy, brightness: score("brightness"), density: score("density"), tension: score("tension"),
    bpm: explicitBpm(brief) ?? Math.round(58 + 86 * energy),
    percussion: noul("percussion") >= C5_THRESHOLDS.percussion,
    silence: noul("silence") >= C5_THRESHOLDS.silence,
  });
}

export type SoundTrack = "melody" | "chord" | "bass" | "drum";
export interface SoundNote {
  track: SoundTrack;
  time: number;
  duration: number;
  midi: number;
  velocity: number;
  pan: number;
}
export interface SoundScore {
  notes: SoundNote[];
  duration: number;
  bars: number;
  steps: number;
  bpm: number;
  seed: number;
}

export function soundSeed(text: string, variation = 0): number {
  let seed = 2166136261;
  for (const char of `${text}:${variation}`) seed = Math.imul(seed ^ char.charCodeAt(0), 16777619);
  return seed >>> 0;
}

/** Jev selects semantic controls; this deterministic sequencer owns every note. */
export function compileSound(mixInput: Readonly<SoundMix>, seed: number): SoundScore {
  const mix = normalizeSoundMix(mixInput);
  const bars = 4, steps = bars * 16, stepTime = 60 / mix.bpm / 4;
  const result: SoundScore = { notes: [], duration: steps * stepTime, bars, steps, bpm: mix.bpm, seed: seed >>> 0 };
  if (mix.silence) return result;
  let state = seed >>> 0;
  const random = () => {
    state = (Math.imul(1664525, state) + 1013904223) >>> 0;
    return state / 4294967296;
  };
  const scale = mix.tension > 0.55 ? [0, 3, 5, 7, 10] : [0, 2, 4, 7, 9];
  const roots = [48, 53, 55, mix.tension > 0.55 ? 50 : 48];
  for (let step = 0; step < steps; step++) {
    const bar = Math.floor(step / 16), root = roots[bar]!;
    const time = step * stepTime;
    if (step % 8 === 0) result.notes.push({ track: "bass", time, duration: stepTime * 6, midi: root - 12, velocity: 0.15, pan: 0 });
    if (step % 16 === 0) for (const interval of [0, mix.tension > 0.55 ? 3 : 4, 7]) {
      result.notes.push({ track: "chord", time, duration: stepTime * 13, midi: root + interval,
        velocity: 0.055, pan: interval / 14 - 0.25 });
    }
    const chance = random();
    if (step % 16 === 0 || chance < 0.08 + mix.density * 0.72) {
      result.notes.push({
        track: "melody", time, duration: Math.min(1.5, stepTime * (mix.timbre === "warm" ? 4 : 2)),
        midi: root + 12 + scale[Math.floor(random() * scale.length)]!,
        velocity: 0.08 + random() * 0.055, pan: (random() - 0.5) * 0.9,
      });
    }
    if (mix.percussion && (step % 4 === 0 || (mix.density > 0.6 && step % 2 === 0))) {
      result.notes.push({ track: "drum", time, duration: 0.15, midi: step % 8 === 0 ? 36 : 42,
        velocity: step % 8 === 0 ? 0.13 : 0.025, pan: 0 });
    }
  }
  return result;
}

export function encodeSoundWav(channels: readonly Float32Array[], sampleRate: number): ArrayBuffer {
  if (channels.length < 1 || channels.length > 2 || !Number.isInteger(sampleRate) || sampleRate < 8000 || sampleRate > 192000)
    throw new Error("无效 PCM 格式");
  const samples = channels[0]!.length;
  if (channels.some(c => c.length !== samples)) throw new Error("声道长度必须相同");
  const bytes = samples * channels.length * 2;
  const output = new ArrayBuffer(44 + bytes);
  const view = new DataView(output);
  const text = (offset: number, value: string) => [...value].forEach((c, i) => view.setUint8(offset + i, c.charCodeAt(0)));
  text(0, "RIFF"); view.setUint32(4, 36 + bytes, true); text(8, "WAVE");
  text(12, "fmt "); view.setUint32(16, 16, true); view.setUint16(20, 1, true);
  view.setUint16(22, channels.length, true); view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * channels.length * 2, true); view.setUint16(32, channels.length * 2, true);
  view.setUint16(34, 16, true); text(36, "data"); view.setUint32(40, bytes, true);
  let offset = 44;
  for (let i = 0; i < samples; i++) for (const channel of channels) {
    const value = channel[i]!;
    if (!Number.isFinite(value)) throw new Error("PCM 包含无效样本");
    const sample = Math.max(-1, Math.min(1, value));
    view.setInt16(offset, Math.round(sample * (sample < 0 ? 32768 : 32767)), true);
    offset += 2;
  }
  return output;
}

export interface C5MusicResponse {
  answers: Answers;
  mix: SoundMix;
  traces: JevTrace[];
}

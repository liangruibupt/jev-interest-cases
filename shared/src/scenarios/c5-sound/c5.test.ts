import { describe, expect, it } from "vitest";
import type { Answers } from "../../types";
import { validateQuestions } from "../../validate";
import {
  C5_DEFAULT_MIX, C5_PRESETS, C5_QUESTIONS, compileSound, encodeSoundWav,
  explicitBpm, normalizeSoundMix, soundMixFromAnswers, soundSeed,
} from "./index";

const score = (value: number) => ({
  type: "score" as const, score: value, confidence: 0.8,
  probabilities: { "0": 0.2, "4": 0.8 }, legend: { "0": "low", "4": "high" },
});
function answers(): Answers {
  return {
    timbre: { type: "choice", choice: "glass", confidence: 0.6, probabilities: { glass: 0.8, warm: 0.1, pluck: 0.1 } },
    energy: score(2), brightness: score(3), density: score(1), tension: score(0.8),
    percussion: { type: "noul", noul: 0.64 }, silence: { type: "noul", noul: 0.1 },
  };
}
describe("C5 semantic sound", () => {
  it("defines seven valid, bounded questions and distinct public presets", () => {
    expect(validateQuestions(C5_QUESTIONS)).toEqual([]);
    expect(Object.keys(C5_QUESTIONS)).toHaveLength(7);
    expect(new Set(C5_PRESETS.map(p => p.brief)).size).toBe(4);
  });
  it("normalizes ordinal Scores and thresholds Nouls instead of using them as intensity", () => {
    const mix = soundMixFromAnswers(answers(), "Slow music");
    expect(mix).toMatchObject({ energy: 0.5, brightness: 0.75, density: 0.25, percussion: false, silence: false });
    expect(soundMixFromAnswers({ ...answers(), percussion: { type: "noul", noul: 0.65 } }, "music").percussion).toBe(true);
  });
  it("parses literal BPM in code and constrains the playable range", () => {
    expect(explicitBpm("Please play 124 BPM")).toBe(124);
    expect(explicitBpm("999 bpm")).toBe(150);
    expect(explicitBpm("12 bpm")).toBe(55);
    expect(explicitBpm("slow")).toBeNull();
    expect(soundMixFromAnswers(answers(), "At 90 beats per minute")).toHaveProperty("bpm", 90);
  });
  it("rejects incomplete, malformed and nonfinite answers", () => {
    expect(() => soundMixFromAnswers({}, "music")).toThrow();
    expect(() => soundMixFromAnswers({ ...answers(), energy: score(NaN) }, "music")).toThrow();
    expect(() => soundMixFromAnswers({ ...answers(), energy: score(5) }, "music")).toThrow();
    expect(() => soundMixFromAnswers({ ...answers(), silence: { type: "noul", noul: -1 } }, "music")).toThrow();
    expect(() => normalizeSoundMix({ ...C5_DEFAULT_MIX, bpm: Infinity })).toThrow();
  });
  it("is deterministic, bounded, nonmutating, and supports local variations", () => {
    const before = { ...C5_DEFAULT_MIX }, seed = soundSeed("rain");
    const first = compileSound(before, seed);
    expect(compileSound(before, seed)).toEqual(first);
    expect(compileSound(before, soundSeed("rain", 1))).not.toEqual(first);
    expect(before).toEqual(C5_DEFAULT_MIX);
    expect(first.notes.length).toBeGreaterThan(0);
    expect(first.notes.every(n => n.time >= 0 && n.time < first.duration && n.velocity <= 0.2 && n.midi > 0)).toBe(true);
    expect(first.notes.some(n => n.track === "drum")).toBe(false);
    expect(compileSound({ ...before, percussion: true }, seed).notes.some(n => n.track === "drum")).toBe(true);
  });
  it("respects complete silence, and a denser fixture has more notes", () => {
    expect(compileSound({ ...C5_DEFAULT_MIX, silence: true }, 1).notes).toEqual([]);
    expect(compileSound({ ...C5_DEFAULT_MIX, density: 1 }, 1).notes.length)
      .toBeGreaterThan(compileSound({ ...C5_DEFAULT_MIX, density: 0 }, 1).notes.length);
  });
  it("writes a valid bounded 16-bit stereo WAV and rejects invalid PCM", () => {
    const wav = encodeSoundWav([new Float32Array([-2, 0, 2]), new Float32Array([1, 0, -1])], 44100);
    const bytes = new Uint8Array(wav), view = new DataView(wav);
    expect(new TextDecoder().decode(bytes.slice(0, 4))).toBe("RIFF");
    expect(view.getUint16(22, true)).toBe(2);
    expect(view.getUint32(40, true)).toBe(12);
    expect(view.getInt16(44, true)).toBe(-32768);
    expect(view.getInt16(46, true)).toBe(32767);
    expect(() => encodeSoundWav([new Float32Array([NaN])], 44100)).toThrow();
    expect(() => encodeSoundWav([new Float32Array(1), new Float32Array(2)], 44100)).toThrow();
  });
});

import { C5_PRESETS, C5_QUESTIONS, buildC5State, compileSound, soundMixFromAnswers, soundSeed, type Answers } from "@jev/shared";
import { askJev } from "../../server/src/lib/jev";

export async function c5(): Promise<void> {
  const rows = [];
  for (const preset of C5_PRESETS) {
    const { result, trace } = await askJev(
      { scenario: "c5", state: buildC5State(preset.brief), questions: C5_QUESTIONS },
      { cache: "read-write" },
    );
    const mix = soundMixFromAnswers(result.answers as unknown as Answers, preset.brief);
    const score = compileSound(mix, soundSeed(preset.brief));
    rows.push({
      preset: preset.id, timbre: mix.timbre, bpm: mix.bpm, density: mix.density.toFixed(2),
      percussion: mix.percussion, silence: mix.silence, notes: score.notes.length,
      cached: trace.cached, latencyMs: trace.latencyMs, usd: trace.cost.usd,
    });
  }
  console.table(rows);
}

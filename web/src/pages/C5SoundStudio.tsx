import {
  C5_DEFAULT_MIX, C5_LIMITS, C5_PRESETS, C5_QUESTIONS, compileSound, encodeSoundWav,
  soundSeed, type C5MusicResponse, type JevTrace, type SoundMix, type SoundScore, type SoundTrack,
} from "@jev/shared";
import { Activity, CloudRain, Download, Headphones, Orbit, Play, RotateCcw, Shuffle, Square, Sun, Waves } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { AnswerCard } from "../components/AnswerCard";
import { LatencyChip } from "../components/LatencyChip";
import { RequestInspector } from "../components/RequestInspector";
import { SavingsCard } from "../components/SavingsCard";
import { api } from "../lib/api";
import { fmtUsd } from "../lib/format";
import { renderSound } from "../lib/sound";
import { useSession } from "../store/session";
import "./sound-studio.css";

const TIMBRES = { warm: "暖弦", glass: "玻璃", pluck: "拨弦" } as const;
const PRESET_ICONS = [CloudRain, Sun, Activity, Orbit];
const TRACKS: { id: SoundTrack; label: string; color: string }[] = [
  { id: "melody", label: "旋律", color: "#79dfbe" },
  { id: "chord", label: "和声", color: "#87bdf5" },
  { id: "bass", label: "低音", color: "#eabb72" },
  { id: "drum", label: "鼓点", color: "#de93b0" },
];

function PianoRoll({ score, cursor }: { score: SoundScore; cursor: RefObject<HTMLDivElement | null> }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const element = canvas.current;
    if (!element) return;
    const draw = () => {
      const width = element.getBoundingClientRect().width, height = 268, dpr = window.devicePixelRatio || 1;
      element.width = Math.round(width * dpr); element.height = height * dpr;
      const ctx = element.getContext("2d");
      if (!ctx) return;
      ctx.scale(dpr, dpr);
      ctx.fillStyle = "#15272c"; ctx.fillRect(0, 0, width, height);
      const left = 48, usable = Math.max(1, width - left - 16);
      ctx.font = '11px "IBM Plex Mono", monospace';
      for (let beat = 0; beat <= 16; beat++) {
        const x = left + beat / 16 * usable;
        ctx.strokeStyle = beat % 4 === 0 ? "#45616a" : "#273f47";
        ctx.beginPath(); ctx.moveTo(x, 25); ctx.lineTo(x, height - 17); ctx.stroke();
        if (beat % 4 === 0 && beat < 16) { ctx.fillStyle = "#93aeb7"; ctx.fillText(`0${beat / 4 + 1}`, x + 5, 17); }
      }
      TRACKS.forEach((track, lane) => {
        const y = 38 + lane * 53;
        ctx.fillStyle = track.color; ctx.fillText(track.label, 8, y + 17);
        ctx.strokeStyle = "#2b4249"; ctx.beginPath(); ctx.moveTo(left, y + 38); ctx.lineTo(width - 16, y + 38); ctx.stroke();
      });
      for (const note of score.notes) {
        const lane = TRACKS.findIndex(t => t.id === note.track);
        const x = left + note.time / score.duration * usable;
        const width = Math.max(3, Math.min(note.duration, score.duration - note.time) / score.duration * usable);
        const y = 40 + lane * 53 + (note.track === "drum" ? 10 : (note.midi % 12) / 12 * 22);
        ctx.fillStyle = TRACKS[lane]!.color;
        ctx.globalAlpha = note.track === "chord" ? 0.65 : 0.95;
        ctx.beginPath(); ctx.roundRect(x, y, width, note.track === "chord" ? 5 : 7, 2); ctx.fill();
      }
      ctx.globalAlpha = 1;
    };
    draw();
    const observer = new ResizeObserver(draw);
    observer.observe(element);
    return () => observer.disconnect();
  }, [score]);
  return (
    <div className="sound-roll">
      <canvas ref={canvas} role="img" aria-label={`四小节乐谱，${score.notes.length} 个音符，${score.bpm} BPM`} />
      <div className="sound-playhead" ref={cursor} aria-hidden="true" />
    </div>
  );
}

function Knob({ label, value, min = 0, max = 100, unit = "%", onChange }: {
  label: string; value: number; min?: number; max?: number; unit?: string; onChange: (value: number) => void;
}) {
  return (
    <label className="sound-knob">
      <span>{label}<output>{Math.round(value)}<small>{unit}</small></output></span>
      <input type="range" min={min} max={max} step={1} value={value} onChange={e => onChange(Number(e.target.value))} aria-label={label} />
    </label>
  );
}

export function C5SoundStudio() {
  const { addTraces } = useSession();
  const [brief, setBrief] = useState<string>(C5_PRESETS[0].brief);
  const [mix, setMix] = useState<SoundMix>({ ...C5_DEFAULT_MIX });
  const [variation, setVariation] = useState(0);
  const [last, setLast] = useState<C5MusicResponse | null>(null);
  const [analyzedBrief, setAnalyzedBrief] = useState("");
  const [traces, setTraces] = useState<JevTrace[]>([]);
  const [busy, setBusy] = useState(false);
  const [live, setLive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [manual, setManual] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [rendering, setRendering] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [volume, setVolume] = useState(60);
  const [elapsed, setElapsed] = useState(0);
  const requestSeq = useRef(0), audioSeq = useRef(0);
  const audioContext = useRef<AudioContext | null>(null);
  const source = useRef<AudioBufferSourceNode | null>(null);
  const output = useRef<GainNode | null>(null);
  const animation = useRef(0), cursor = useRef<HTMLDivElement | null>(null);
  const bufferCache = useRef<{ key: string; buffer: AudioBuffer } | null>(null);
  const seed = useMemo(() => soundSeed(analyzedBrief || brief, variation), [analyzedBrief, brief, variation]);
  const score = useMemo(() => compileSound(mix, seed), [mix, seed]);
  const lastTrace = last?.traces[0];
  const stale = Boolean(last && brief.trim() !== analyzedBrief);

  const stop = useCallback(() => {
    audioSeq.current++;
    if (source.current) { source.current.onended = null; try { source.current.stop(); } catch { /* already ended */ } }
    source.current = null;
    cancelAnimationFrame(animation.current);
    if (cursor.current) { cursor.current.style.opacity = "0"; cursor.current.style.left = "48px"; }
    setPlaying(false); setRendering(false); setElapsed(0);
  }, []);
  useEffect(() => () => {
    requestSeq.current++;
    audioSeq.current++;
    cancelAnimationFrame(animation.current);
    try { source.current?.stop(); } catch { /* already ended */ }
    void audioContext.current?.close();
  }, []);
  useEffect(() => {
    if (output.current && audioContext.current) output.current.gain.setTargetAtTime(volume / 100, audioContext.current.currentTime, 0.015);
  }, [volume]);

  function editBrief(value: string) {
    requestSeq.current++;
    setBusy(false); setBrief(value); setError(null);
  }
  function selectPreset(value: string) {
    stop(); editBrief(value); setAnalyzedBrief(""); setLast(null); setManual(false);
    setMix({ ...C5_DEFAULT_MIX }); setVariation(0);
  }
  function updateMix(patch: Partial<SoundMix>) {
    stop(); setMix(current => ({ ...current, ...patch })); setManual(true);
  }
  async function interpret() {
    const mine = ++requestSeq.current, submitted = brief.trim();
    setBusy(true); setError(null);
    try {
      const result = await api.post<C5MusicResponse>("/api/c5/interpret", { brief: submitted, live });
      // Account for paid calls even when their result has become stale.
      addTraces(result.traces);
      if (mine !== requestSeq.current) return;
      setTraces(current => [...current, ...result.traces]);
      stop(); setLast(result); setMix(result.mix); setAnalyzedBrief(submitted); setVariation(0); setManual(false);
    } catch (e) {
      if (mine === requestSeq.current) setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (mine === requestSeq.current) setBusy(false);
    }
  }
  async function getBuffer() {
    const key = JSON.stringify({ mix, seed });
    if (bufferCache.current?.key === key) return bufferCache.current.buffer;
    const buffer = await renderSound(score, mix);
    bufferCache.current = { key, buffer };
    return buffer;
  }
  async function play() {
    if (playing || rendering) { stop(); return; }
    const mine = ++audioSeq.current;
    setError(null); setRendering(true);
    try {
      // Create/resume only inside a user gesture; never auto-play on inference.
      const ctx = audioContext.current ?? new AudioContext();
      audioContext.current = ctx;
      await ctx.resume();
      const buffer = await getBuffer();
      if (mine !== audioSeq.current) return;
      const node = ctx.createBufferSource(), gain = ctx.createGain();
      node.buffer = buffer; gain.gain.value = volume / 100;
      node.connect(gain); gain.connect(ctx.destination); source.current = node; output.current = gain;
      const started = ctx.currentTime;
      let lastTick = -1;
      node.onended = () => { if (mine === audioSeq.current) stop(); };
      node.start(); setPlaying(true); setRendering(false);
      const tick = () => {
        if (mine !== audioSeq.current) return;
        const seconds = ctx.currentTime - started;
        const width = cursor.current?.parentElement?.clientWidth ?? 1;
        if (cursor.current) {
          cursor.current.style.opacity = "1";
          cursor.current.style.left = `${48 + Math.min(1, seconds / score.duration) * Math.max(1, width - 64)}px`;
        }
        const value = Math.floor(seconds * 5) / 5;
        if (value !== lastTick) { setElapsed(value); lastTick = value; }
        animation.current = requestAnimationFrame(tick);
      };
      tick();
    } catch (e) {
      if (mine === audioSeq.current) { setError(e instanceof Error ? e.message : "音频播放失败"); stop(); }
    }
  }
  async function exportWav() {
    setExporting(true); setError(null);
    try {
      const buffer = await getBuffer();
      const channels = Array.from({ length: buffer.numberOfChannels }, (_, i) => buffer.getChannelData(i));
      const url = URL.createObjectURL(new Blob([encodeSoundWav(channels, buffer.sampleRate)], { type: "audio/wav" }));
      const anchor = document.createElement("a");
      anchor.href = url; anchor.download = `jev-sound-${seed.toString(16)}.wav`; anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
    } catch (e) { setError(e instanceof Error ? e.message : "音频导出失败"); }
    finally { setExporting(false); }
  }

  return (
    <div className="sound-studio rise">
      <header className="sound-heading">
        <div><div className="sound-kicker"><Waves size={16} /> C5 / SOUND ATELIER</div><h1>语义音乐盒</h1></div>
        <div className="sound-heading-meta"><Headphones size={19} /><span>Jev × Web Audio</span><span className="sound-pill">纯器乐</span></div>
      </header>
      <div className="sound-workspace">
        <section className="sound-brief">
          <div className="sound-label">灵感片段 <span>ENGLISH BRIEF</span></div>
          <div className="sound-presets">
            {C5_PRESETS.map((preset, i) => {
              const Icon = PRESET_ICONS[i]!;
              return <button key={preset.id} className={brief === preset.brief ? "selected" : ""} onClick={() => selectPreset(preset.brief)} aria-pressed={brief === preset.brief}><Icon size={17} />{preset.title}</button>;
            })}
          </div>
          <label htmlFor="sound-brief" className="sound-label">声音描述</label>
          <textarea id="sound-brief" value={brief} maxLength={C5_LIMITS.maxChars} onChange={e => editBrief(e.target.value)} rows={7} spellCheck={false} />
          <div className="sound-input-foot"><span>{brief.length} / {C5_LIMITS.maxChars}</span><label><input type="checkbox" checked={live} onChange={e => setLive(e.target.checked)} />重新推理</label></div>
          <button className="sound-primary" disabled={busy || brief.trim().length < C5_LIMITS.minChars} onClick={() => void interpret()}><Waves size={18} />{busy ? "Jev 解读中…" : "解读声音"}</button>
          <div className="sound-origin" role="status">
            <span className={`sound-status-dot ${last ? "active" : ""}`} />
            <span>{stale ? "描述已改，结果尚未更新" : last ? manual ? "Jev 音色 · 已手动调整" : "Jev 音色" : "手动预置音色"}</span>
          </div>
          <dl className="sound-receipt">
            <div><dt>模型</dt><dd>{lastTrace?.model ?? "—"}</dd></div>
            <div><dt>耗时</dt><dd>{lastTrace ? <LatencyChip ms={lastTrace.latencyMs} cached={lastTrace.cached} /> : "—"}</dd></div>
            <div><dt>本次费用</dt><dd>{lastTrace ? fmtUsd(lastTrace.cost.usd) : "—"}</dd></div>
            <div><dt>原语</dt><dd>1 Choice · 4 Score · 2 Noul</dd></div>
          </dl>
          {error && <div className="sound-error" role="alert">{error}</div>}
        </section>

        <section className="sound-instrument">
          <div className="sound-instrument-head"><div><span className="sound-label">声谱 / SEQUENCE</span><h2>{TIMBRES[mix.timbre]} <span>{mix.silence ? "静音" : `${mix.bpm} BPM`}</span></h2></div><div className="sound-seed">TAKE {String(variation + 1).padStart(2, "0")}<small>{score.notes.length} NOTES / 4 BARS</small></div></div>
          <PianoRoll score={score} cursor={cursor} />
          <div className="sound-transport">
            <button className="sound-play" onClick={() => void play()} title={playing || rendering ? "停止" : "播放"} aria-label={playing || rendering ? "停止" : "播放"}>
              {playing || rendering ? <Square size={19} fill="currentColor" /> : <Play size={19} fill="currentColor" />}
            </button>
            <span className="sound-time">{rendering ? "合成中" : `${elapsed.toFixed(1)} / ${(score.duration + 1.6).toFixed(1)} s`}</span>
            <button className="sound-icon" onClick={() => { stop(); setVariation(v => v + 1); setManual(true); }} title="本地变奏" aria-label="本地变奏"><Shuffle size={18} /></button>
            <button className="sound-icon" onClick={() => { stop(); setMix(last ? { ...last.mix } : { ...C5_DEFAULT_MIX }); setVariation(0); setManual(false); }} title="恢复音色" aria-label="恢复音色"><RotateCcw size={18} /></button>
            <button className="sound-export" disabled={exporting} onClick={() => void exportWav()}><Download size={17} />{exporting ? "导出中…" : "WAV"}</button>
          </div>
          <div className="sound-timbres" role="group" aria-label="音色">
            {(Object.entries(TIMBRES) as [SoundMix["timbre"], string][]).map(([key, title]) =>
              <button key={key} aria-pressed={mix.timbre === key} className={mix.timbre === key ? "selected" : ""} onClick={() => updateMix({ timbre: key })}>{title}</button>)}
            <label><input type="checkbox" checked={mix.percussion} onChange={e => updateMix({ percussion: e.target.checked })} />鼓点</label>
            <label><input type="checkbox" checked={mix.silence} onChange={e => updateMix({ silence: e.target.checked })} />静音</label>
          </div>
          <div className="sound-mix">
            <Knob label="能量" value={mix.energy * 100} onChange={v => updateMix({ energy: v / 100, bpm: Math.round(58 + 86 * v / 100) })} />
            <Knob label="明亮度" value={mix.brightness * 100} onChange={v => updateMix({ brightness: v / 100 })} />
            <Knob label="密度" value={mix.density * 100} onChange={v => updateMix({ density: v / 100 })} />
            <Knob label="张力" value={mix.tension * 100} onChange={v => updateMix({ tension: v / 100 })} />
            <Knob label="速度" value={mix.bpm} min={C5_LIMITS.minBpm} max={C5_LIMITS.maxBpm} unit=" BPM" onChange={v => updateMix({ bpm: v })} />
            <Knob label="监听音量" value={volume} onChange={setVolume} />
          </div>
        </section>
      </div>
      {last && <details className="sound-raw"><summary>Jev 原始判断 <span>7 项</span></summary><div className="sound-answer-grid">{Object.entries(C5_QUESTIONS).map(([id, question]) => <AnswerCard key={id} id={id} question={question} answer={last.answers[id]!} />)}</div></details>}
      <div className="sound-audit"><SavingsCard scenario="c5" jevTraces={traces} /><RequestInspector traces={traces} /></div>
    </div>
  );
}

/**
 * Generate synthetic French attack voice + SFX (Node, no Python/ffmpeg required).
 * Voice: msedge-tts (fr-FR-HenriNeural). SFX: procedural PCM. Output: WAV in assets/audio/attacks/
 *
 * Run: npm install && node scripts/generate-attack-voices.mjs
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import decodeAudio from 'audio-decode';
import { MsEdgeTTS, OUTPUT_FORMAT } from 'msedge-tts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'assets', 'audio', 'attacks');

const SAMPLE_RATE = 44100;
const VOICE_MAX_MS = 1000;
const TOTAL_MS = 2800;
const VOICE = 'fr-FR-HenriNeural';

function t(length) {
  const n = Math.floor(SAMPLE_RATE * length);
  return { n, step: 1 / SAMPLE_RATE, arr: new Float64Array(n) };
}

function env(length, attack = 0.01, release = 0.08) {
  const n = Math.floor(SAMPLE_RATE * length);
  const a = Math.max(1, Math.floor(SAMPLE_RATE * attack));
  const r = Math.max(1, Math.floor(SAMPLE_RATE * release));
  const e = new Float64Array(n).fill(1);
  for (let i = 0; i < a; i++) e[i] = i / a;
  for (let i = 0; i < r; i++) e[n - r + i] = 1 - i / r;
  return e;
}

function mixAt(base, clip, startSec, gain = 1) {
  const start = Math.floor(startSec * SAMPLE_RATE);
  const len = Math.min(clip.length, base.length - start);
  for (let i = 0; i < len; i++) base[start + i] += clip[i] * gain;
}

function normalize(arr, peak = 0.92) {
  let m = 0;
  for (const v of arr) m = Math.max(m, Math.abs(v));
  if (m < 1e-9) return arr;
  const s = peak / m;
  return arr.map((v) => v * s);
}

function rng(seed) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return (s / 0xffffffff) * 2 - 1;
  };
}
const rand = rng(42);

function cosmosRise(dur = 0.45) {
  const n = Math.floor(SAMPLE_RATE * dur);
  const out = new Float64Array(n);
  const f0 = 180;
  const f1 = 2400;
  const e = env(dur, 0.02, 0.12);
  let phase = 0;
  for (let i = 0; i < n; i++) {
    const tt = i / SAMPLE_RATE;
    const f = f0 + ((f1 - f0) * tt) / dur;
    phase += (2 * Math.PI * f) / SAMPLE_RATE;
    out[i] = (Math.sin(phase) + 0.25 * Math.sin(phase * 2) * Math.sin(2 * Math.PI * 6 * tt)) * e[i];
  }
  return out;
}

function energyWhistle(dur = 0.35) {
  const n = Math.floor(SAMPLE_RATE * dur);
  const out = new Float64Array(n);
  const e = env(dur, 0.005, 0.1);
  let phase = 0;
  for (let i = 0; i < n; i++) {
    const tt = i / SAMPLE_RATE;
    const f = 3200 + (1800 * tt) / dur;
    phase += (2 * Math.PI * f) / SAMPLE_RATE;
    out[i] = Math.sin(phase) * e[i] * 0.7;
  }
  return out;
}

function impactBarrage(count = 8, spacing = 0.055) {
  const total = count * spacing + 0.08;
  const out = new Float64Array(Math.floor(SAMPLE_RATE * total));
  for (let i = 0; i < count; i++) {
    const hitLen = 0.04;
    const hn = Math.floor(SAMPLE_RATE * hitLen);
    const hit = new Float64Array(hn);
    const he = env(hitLen, 0.001, 0.03);
    for (let j = 0; j < hn; j++) {
      hit[j] =
        (rand() * he[j] +
          0.5 * Math.sin((2 * Math.PI * (120 + i * 40) * j) / SAMPLE_RATE) * he[j]) *
        0.8;
    }
    mixAt(out, hit, i * spacing, 0.55 - i * 0.03);
  }
  return out;
}

function smallExplosion(dur = 0.22) {
  const n = Math.floor(SAMPLE_RATE * dur);
  const out = new Float64Array(n);
  const e = env(dur, 0.002, dur * 0.7);
  for (let i = 0; i < n; i++) {
    const tt = i / SAMPLE_RATE;
    out[i] = (rand() * 0.5 + 0.8 * Math.sin(2 * Math.PI * 90 * tt) * Math.exp(-tt * 18)) * e[i];
  }
  return out;
}

function dragonRoar(dur = 0.5) {
  const n = Math.floor(SAMPLE_RATE * dur);
  const out = new Float64Array(n);
  const e = env(dur, 0.02, 0.15);
  for (let i = 0; i < n; i++) {
    const tt = i / SAMPLE_RATE;
    const lfo = 0.5 + 0.5 * Math.sin(2 * Math.PI * 7 * tt);
    const low = Math.sin(2 * Math.PI * (55 + 30 * Math.sin(2 * Math.PI * 3 * tt)) * tt);
    out[i] = (rand() * lfo * 0.6 + low * 0.5) * e[i];
  }
  return out;
}

function powerBreath(dur = 0.4) {
  const n = Math.floor(SAMPLE_RATE * dur);
  const out = new Float64Array(n);
  const e = env(dur, 0.04, 0.15);
  let phase = 0;
  for (let i = 0; i < n; i++) {
    const tt = i / SAMPLE_RATE;
    const f = 400 + (800 * tt) / dur;
    phase += (2 * Math.PI * f) / SAMPLE_RATE;
    out[i] = (rand() * 0.35 + Math.sin(phase) * 0.4) * e[i];
  }
  return out;
}

function massiveImpact(dur = 0.35) {
  const n = Math.floor(SAMPLE_RATE * dur);
  const out = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const tt = i / SAMPLE_RATE;
    out[i] = rand() * Math.exp(-tt * 9) * 0.55 + Math.sin(2 * Math.PI * 48 * tt) * Math.exp(-tt * 6) * 0.9;
  }
  return out;
}

function lightEcho(dur = 0.5) {
  const n = Math.floor(SAMPLE_RATE * dur);
  const out = new Float64Array(n);
  const e = env(dur, 0.01, dur * 0.9);
  for (let i = 0; i < n; i++) {
    const tt = i / SAMPLE_RATE;
    out[i] = Math.sin(2 * Math.PI * 520 * tt) * Math.exp(-tt * 5) * e[i] * 0.35;
  }
  return out;
}

function icyWind(dur = 0.55) {
  const n = Math.floor(SAMPLE_RATE * dur);
  const out = new Float64Array(n);
  const e = env(dur, 0.08, 0.2);
  let prev = 0;
  for (let i = 0; i < n; i++) {
    const v = rand();
    const hp = (v - prev) * 2;
    prev = v;
    out[i] = hp * e[i] * 0.45;
  }
  return out;
}

function iceCrystals(dur = 0.45) {
  const out = new Float64Array(Math.floor(SAMPLE_RATE * dur));
  const freqs = [2400, 3100, 3800, 4200, 3600];
  for (let i = 0; i < freqs.length; i++) {
    const pingLen = 0.06;
    const hn = Math.floor(SAMPLE_RATE * pingLen);
    const ping = new Float64Array(hn);
    const pe = env(pingLen, 0.002, 0.04);
    for (let j = 0; j < hn; j++) ping[j] = Math.sin((2 * Math.PI * freqs[i] * j) / SAMPLE_RATE) * pe[j];
    mixAt(out, ping, 0.04 + i * 0.07, 0.22);
  }
  return out;
}

function freezeSfx(dur = 0.35) {
  const n = Math.floor(SAMPLE_RATE * dur);
  const out = new Float64Array(n);
  const e = env(dur, 0.02, 0.15);
  for (let i = 0; i < n; i++) {
    const tt = i / SAMPLE_RATE;
    out[i] = (Math.sin(2 * Math.PI * 880 * tt) * 0.35 + rand() * 0.3) * e[i];
  }
  return out;
}

function iceCrack(dur = 0.25) {
  const n = Math.floor(SAMPLE_RATE * dur);
  const out = new Float64Array(n);
  const e = env(dur, 0.001, 0.08);
  for (let i = 0; i < n; i++) {
    const tt = i / SAMPLE_RATE;
    out[i] = (rand() * 0.5 + Math.sin(2 * Math.PI * 1400 * tt) * Math.exp(-tt * 25) * 0.4) * e[i];
  }
  return out;
}

function buildSeiyaSfx(lenSec) {
  const buf = new Float64Array(Math.floor(SAMPLE_RATE * lenSec));
  mixAt(buf, cosmosRise(), 0, 0.35);
  mixAt(buf, energyWhistle(), 0.35, 0.4);
  mixAt(buf, impactBarrage(), 0.55, 0.5);
  mixAt(buf, smallExplosion(), 1.15, 0.45);
  return normalize(buf);
}

function buildShiryuSfx(lenSec) {
  const buf = new Float64Array(Math.floor(SAMPLE_RATE * lenSec));
  mixAt(buf, dragonRoar(), 0.05, 0.42);
  mixAt(buf, powerBreath(), 0.45, 0.38);
  mixAt(buf, massiveImpact(), 0.95, 0.55);
  mixAt(buf, lightEcho(), 1.25, 0.4);
  return normalize(buf);
}

function buildHyogaSfx(lenSec) {
  const buf = new Float64Array(Math.floor(SAMPLE_RATE * lenSec));
  mixAt(buf, icyWind(), 0, 0.38);
  mixAt(buf, iceCrystals(), 0.4, 0.42);
  mixAt(buf, freezeSfx(), 0.95, 0.4);
  mixAt(buf, iceCrack(), 1.35, 0.48);
  return normalize(buf);
}

function resampleLinear(input, inRate, outRate) {
  if (inRate === outRate) return input;
  const ratio = inRate / outRate;
  const outLen = Math.floor(input.length / ratio);
  const out = new Float64Array(outLen);
  for (let i = 0; i < outLen; i++) {
    const src = i * ratio;
    const i0 = Math.floor(src);
    const i1 = Math.min(i0 + 1, input.length - 1);
    const f = src - i0;
    out[i] = input[i0] * (1 - f) + input[i1] * f;
  }
  return out;
}

function trimStretchVoice(floats, inRate, maxMs) {
  let v = resampleLinear(floats, inRate, SAMPLE_RATE);
  const maxSamples = Math.floor((maxMs / 1000) * SAMPLE_RATE);
  if (v.length > maxSamples) {
    const ratio = v.length / maxSamples;
    v = resampleLinear(v, SAMPLE_RATE, SAMPLE_RATE * ratio);
    v = v.subarray(0, maxSamples);
  }
  return v;
}

function applyGain(arr, db) {
  const g = 10 ** (db / 20);
  return arr.map((x) => x * g);
}

function compose(voiceFloats, sfxFloats) {
  const total = Math.floor((TOTAL_MS / 1000) * SAMPLE_RATE);
  const out = new Float64Array(total);
  const sfxGain = 10 ** (-4 / 20);
  const voiceGain = 10 ** (4 / 20);
  for (let i = 0; i < total; i++) out[i] = (sfxFloats[i] || 0) * sfxGain;
  for (let i = 0; i < voiceFloats.length && i < total; i++) out[i] += voiceFloats[i] * voiceGain;
  return normalize(out);
}

function writeWav(filePath, floats) {
  const n = floats.length;
  const buf = Buffer.alloc(44 + n * 2);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + n * 2, 4);
  buf.write('WAVE', 8);
  buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(SAMPLE_RATE, 24);
  buf.writeUInt32LE(SAMPLE_RATE * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) {
    const s = Math.max(-1, Math.min(1, floats[i]));
    buf.writeInt16LE(Math.round(s * 32767), 44 + i * 2);
  }
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, buf);
}

async function synthesizeVoice(text, rate = '+18%') {
  const tts = new MsEdgeTTS();
  await tts.setMetadata(VOICE, OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3, { rate });
  const { audioStream } = tts.toStream(text);
  const chunks = [];
  for await (const chunk of audioStream) chunks.push(chunk);
  const decoded = await decodeAudio(Buffer.concat(chunks));
  const floats = decoded.getChannelData(0);
  return trimStretchVoice(floats, decoded.sampleRate, VOICE_MAX_MS);
}

async function generate(filename, text, sfxBuilder, rate) {
  console.log(`  ${filename} …`);
  const voice = await synthesizeVoice(text, rate);
  const sfx = sfxBuilder(TOTAL_MS / 1000);
  const mixed = compose(voice, sfx);
  const outPath = path.join(OUT_DIR, filename);
  writeWav(outPath, mixed);
  console.log(`    -> ${outPath} (${mixed.length} samples)`);
}

const ATTACKS = [
  ['seiya_meteores.wav', 'Par les Météores de Pégase !', buildSeiyaSfx, '+22%'],
  ['shiryu_dragon.wav', 'Colère du Dragon !', buildShiryuSfx, '+12%'],
  ['hyoga_diamond_dust.wav', 'Poussière de Diamant !', buildHyogaSfx, '+8%'],
];

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  console.log(`Output: ${OUT_DIR}`);
  for (const [file, text, sfx, rate] of ATTACKS) {
    await generate(file, text, sfx, rate);
  }
  console.log('Done.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

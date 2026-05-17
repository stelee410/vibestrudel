// 启动时加载 manifest, 提取合法 bank/sound 名供 validate.js 用
import fs from "node:fs/promises";
import path from "node:path";

const MANIFEST_DIR = process.env.MANIFEST_DIR || "/app/manifests";

export async function loadValidNames() {
  const validBanks = new Set();
  const validSounds = new Set([
    // 合成器波形 — 永远合法
    "sine", "triangle", "saw", "sawtooth", "square", "pulse",
    "white", "pink", "brown",
    // 默认 dirt 鼓字母(在 dirt-samples 里有)
    "bd", "sd", "hh", "cp", "cb", "lt", "mt", "ht",
    // 2 字母 drum 字母(.bank() 之后才有)
    "oh", "rim", "cr", "rd", "sh", "tb", "perc", "misc", "fx",
  ]);

  // tidal-drum-machines: 提供 bank 名 + bank↔drum 组合表 (用于检查 .bank("X") 下能不能用 s("Y"))
  const bankDrums = new Map();  // bankName → Set of drum letters this bank actually has
  try {
    const tdm = JSON.parse(await fs.readFile(path.join(MANIFEST_DIR, "tidal-drum-machines.json"), "utf8"));
    for (const k of Object.keys(tdm)) {
      if (k.startsWith("_")) continue;
      // 形如 RolandTR909_bd → bank=RolandTR909, drum=bd
      const i = k.lastIndexOf("_");
      if (i > 0) {
        const bank = k.slice(0, i);
        const drum = k.slice(i + 1);
        validBanks.add(bank);
        if (!bankDrums.has(bank)) bankDrums.set(bank, new Set());
        bankDrums.get(bank).add(drum);
      }
    }
  } catch (e) {
    console.warn("[samples] tidal-drum-machines.json not found:", e.message);
  }

  // VCSL: 提供 sound 名
  try {
    const vcsl = JSON.parse(await fs.readFile(path.join(MANIFEST_DIR, "vcsl.json"), "utf8"));
    for (const k of Object.keys(vcsl)) {
      if (!k.startsWith("_")) validSounds.add(k);
    }
  } catch (e) {
    console.warn("[samples] vcsl.json not found:", e.message);
  }

  // piano
  try {
    const piano = JSON.parse(await fs.readFile(path.join(MANIFEST_DIR, "piano.json"), "utf8"));
    for (const k of Object.keys(piano)) {
      if (!k.startsWith("_")) validSounds.add(k);
    }
  } catch (e) {}

  // dirt-samples 基础(把所有 group 名也加进 validSounds 兜底)
  try {
    const dirt = JSON.parse(await fs.readFile(path.join(MANIFEST_DIR, "dirt-samples.strudel.json"), "utf8"));
    for (const k of Object.keys(dirt)) {
      if (!k.startsWith("_")) validSounds.add(k);
    }
  } catch (e) {}

  console.log(`[samples] loaded validBanks=${validBanks.size}, validSounds=${validSounds.size}, bankDrums entries=${bankDrums.size}`);
  return { validBanks, validSounds, bankDrums };
}

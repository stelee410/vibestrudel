// Strudel 代码服务端校验
// 老实声明: 只能挡明显错误 (JS 语法 / 不存在的函数 / 超界 gain / 错误 sample 名)
// 挡不住运行时 chained method 不存在的情况 — 那种交给客户端处理

import { Parser } from "acorn";
import { simple as walkSimple } from "acorn-walk";

// === 白名单 ===

// 顶级函数 (从 vendor/strudel/index.mjs 提取的全局)
const SAFE_TOPLEVEL = new Set([
  "stack", "cat", "seq", "s", "n", "note", "sound",
  "setcpm", "cpm", "silence", "hush", "samples",
  "arrange", "timeCat", "polymeter", "polyrhythm",
  "sine", "cosine", "rand", "irand", "perlin",
  "saw", "square", "tri", "isaw",
]);

// Pattern 方法 — 一个比较宽松的常用集合
// 真要严格,可在 build 时从 vendor/strudel/index.mjs 自动 grep prototype.X
const SAFE_METHODS = new Set([
  // 控制 / 时间
  "fast", "slow", "early", "late", "rev", "iter", "ply", "chop",
  "every", "sometimes", "often", "rarely", "almostNever", "almostAlways",
  "struct", "mask", "fix", "loopAt", "loopFirst",
  "off", "swing", "swingBy", "echo", "stut",
  // 音色 / 滤波
  "s", "sound", "n", "note", "scale", "bank",
  "gain", "velocity", "postgain", "pan",
  "lpf", "hpf", "bpf", "lpq", "hpq", "lpenv", "lpa", "lpr", "lpd", "lps",
  "attack", "decay", "sustain", "release", "adsr",
  "speed", "shape", "distort", "crush", "coarse", "vowel", "phaser",
  "delay", "delaytime", "delayfb", "delayfeedback",
  "room", "roomsize", "size", "dry",
  "chorus", "tremolo",
  // 调式
  "scale", "rot", "transpose", "add", "sub", "mul", "div", "range",
  // 视觉
  "pianoroll", "punchcard", "pitchwheel", "spiral", "wordfall",
  "scope", "tscope", "fscope", "spectrum",
  "color", "colour", "draw", "animate", "onPaint",
  // 杂项
  "set", "with", "when", "succ", "press", "linger", "compress",
  "jux", "juxBy", "superimpose", "layer", "stack",
]);

// === 校验主逻辑 ===

/**
 * @param {string} code
 * @param {{validBanks?: Set<string>, validSounds?: Set<string>}} ctx
 */
export function validate(code, ctx = {}) {
  const errors = [];

  if (!code || code.length > 8000) {
    return { ok: false, errors: ["code empty or too large"] };
  }

  // 必须含 stack( / s( / note( / cat( 之一(避免空代码或非 Strudel)
  if (!/(^|[^a-zA-Z_])(stack|s|n|note|cat|seq|sound)\s*\(/.test(code)) {
    return { ok: false, errors: ["not Strudel-like (missing stack/s/note/cat call)"] };
  }

  // JS syntax
  let ast;
  try {
    ast = Parser.parse(code, { ecmaVersion: 2022, sourceType: "module", allowReturnOutsideFunction: true });
  } catch (e) {
    return { ok: false, errors: [`JS syntax: ${e.message}`] };
  }

  // 遍历 AST
  walkSimple(ast, {
    CallExpression(node) {
      const callee = node.callee;

      // 顶级函数调用 (Identifier)
      if (callee.type === "Identifier") {
        if (!SAFE_TOPLEVEL.has(callee.name)) {
          errors.push(`unknown top-level function: ${callee.name}() — not in whitelist`);
        }
      }

      // 方法调用 (MemberExpression)
      if (callee.type === "MemberExpression" && callee.property.type === "Identifier") {
        const methodName = callee.property.name;
        if (!SAFE_METHODS.has(methodName)) {
          errors.push(`unknown method: .${methodName}() — not in whitelist`);
        }

        // 检查 .gain(N) 数字常量
        if (methodName === "gain" && node.arguments[0]?.type === "Literal") {
          const v = node.arguments[0].value;
          if (typeof v === "number" && (v < 0 || v > 1.5)) {
            errors.push(`.gain(${v}) out of safe range [0, 1.5]`);
          }
        }

        // 检查 .pan(N) 数字常量
        if (methodName === "pan" && node.arguments[0]?.type === "Literal") {
          const v = node.arguments[0].value;
          if (typeof v === "number" && (v < -1 || v > 1)) {
            errors.push(`.pan(${v}) out of [-1, 1]`);
          }
        }

        // 检查 .bank("xxx") 字符串
        if (methodName === "bank" && node.arguments[0]?.type === "Literal") {
          const v = node.arguments[0].value;
          if (typeof v === "string" && ctx.validBanks && !ctx.validBanks.has(v)) {
            errors.push(`.bank("${v}") not in valid bank list`);
          }
        }

        // 检查 .scale("xxx") 字符串
        if (methodName === "scale" && node.arguments[0]?.type === "Literal") {
          const v = node.arguments[0].value;
          if (typeof v === "string" && !/^[A-Ga-g][#b]?:[a-z\-]+$/.test(v) && !/^[a-z\-]+$/.test(v)) {
            errors.push(`.scale("${v}") format invalid (use "C:minor")`);
          }
        }
      }
    },
  });

  if (errors.length) return { ok: false, errors };
  return { ok: true };
}

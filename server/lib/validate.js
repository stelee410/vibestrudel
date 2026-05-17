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

// 把 acorn 的 Literal/UnaryExpression(-Literal) 都解出真实数字, 别的返回 null
function literalNumber(node) {
  if (!node) return null;
  if (node.type === "Literal" && typeof node.value === "number") return node.value;
  if (node.type === "UnaryExpression" && node.operator === "-"
      && node.argument?.type === "Literal" && typeof node.argument.value === "number") {
    return -node.argument.value;
  }
  return null;
}

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

        // 检查 .gain(N) / .velocity(N) / .postgain(N) 数字常量 (含 -N 等 UnaryExpression)
        // 上限 1.0 — 0~1.0 是音乐范围, 超过容易爆破耳膜
        if (methodName === "gain" || methodName === "velocity" || methodName === "postgain") {
          const v = literalNumber(node.arguments[0]);
          if (v !== null && (v < 0 || v > 1.0)) {
            errors.push(`.${methodName}(${v}) out of safe range [0, 1.0]`);
          }
        }

        // 检查 .pan(N) 数字常量 (含 -N)
        // Strudel 的 .pan() 是 unipolar [0, 1] (0=L, 0.5=center, 1=R) — superdough 内部 2x-1
        if (methodName === "pan") {
          const v = literalNumber(node.arguments[0]);
          if (v !== null && (v < 0 || v > 1)) {
            errors.push(`.pan(${v}) out of [0, 1] (Strudel pan: 0=L, 0.5=center, 1=R)`);
          }
        }

        // 检查 .pan(...) 内的振荡器/随机源
        if (methodName === "pan" && node.arguments[0]) {
          const arg = node.arguments[0];
          // 已知会 overshoot/越界的 raw 信号源 — 必须用 .range(L,H) 包住
          const RAW_OSC = new Set(["sine","cosine","saw","isaw","tri","triangle","square","rand","irand","perlin"]);

          // a) 直接 .pan(sine) 这种 — raw oscillator outputs [0, 1] but center is 0.5,
          //    .pan(sine) 直接传会让 sine=0 时 audioparam=-1 (硬左), 永远不到中. 必须 wrap in .range
          if (arg.type === "Identifier" && RAW_OSC.has(arg.name)) {
            errors.push(`.pan(${arg.name}) raw oscillator; wrap in .range(L, H) with L,H in [0, 1] (e.g. .range(0.3, 0.7))`);
          }

          // b) AST 走查 .pan 参数内任何 .range(num, num) — 边界必须 ∈ [0, 1]
          //    包括 UnaryExpression (-0.3 之类), 别让负数从这里漏过去.
          walkSimple(arg, {
            CallExpression(inner) {
              if (inner.callee?.type === "MemberExpression"
                  && inner.callee.property?.type === "Identifier"
                  && inner.callee.property.name === "range"
                  && inner.arguments.length >= 2) {
                const lo = literalNumber(inner.arguments[0]);
                const hi = literalNumber(inner.arguments[1]);
                if (lo !== null && (lo < 0 || lo > 1)) {
                  errors.push(`.pan(...range(${lo}, ...)) lower bound out of [0, 1] (Strudel pan: 0=L, 0.5=center, 1=R)`);
                }
                if (hi !== null && (hi < 0 || hi > 1)) {
                  errors.push(`.pan(...range(..., ${hi})) upper bound out of [0, 1] (Strudel pan: 0=L, 0.5=center, 1=R)`);
                }
              }
            }
          });
        }

        // 检查 .distort(N) / .crush(N) / .shape(N) — 避免极端失真伤耳朵
        if ((methodName === "distort" || methodName === "shape")
            && node.arguments[0]?.type === "Literal") {
          const v = node.arguments[0].value;
          if (typeof v === "number" && (v < 0 || v > 0.8)) {
            errors.push(`.${methodName}(${v}) out of safe range [0, 0.8]`);
          }
        }
        if (methodName === "crush" && node.arguments[0]?.type === "Literal") {
          const v = node.arguments[0].value;
          // crush 是 bit depth, 越小越脏; <3 几乎全噪声
          if (typeof v === "number" && (v < 3 || v > 16)) {
            errors.push(`.crush(${v}) out of safe range [3, 16]`);
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

        // 检查 s("X").bank("Y") 组合 — 如果 bank Y 不含鼓 X 就报错
        // 避开 "RolandTR909_sh not found" 这类运行时错
        if (methodName === "bank" && node.arguments[0]?.type === "Literal"
            && typeof node.arguments[0].value === "string"
            && ctx.bankDrums) {
          const bankName = node.arguments[0].value;
          const allowedDrums = ctx.bankDrums.get(bankName);
          if (allowedDrums) {
            // 沿着 .bank() 的对象链往里走找 s("...") 调用
            const drumPattern = findSPattern(callee.object);
            if (drumPattern) {
              const tokens = extractDrumTokens(drumPattern);
              for (const tok of tokens) {
                if (!allowedDrums.has(tok)) {
                  errors.push(`bank "${bankName}" 不含 "${tok}" — 该 bank 只有: ${[...allowedDrums].sort().join(", ")}`);
                }
              }
            }
          }
        }
      }
    },
  });

  if (errors.length) return { ok: false, errors };
  return { ok: true };
}

// 沿着 method chain 的 object 往里走, 找形如 s("...") 的 CallExpression, 返回里面的 string literal
function findSPattern(node) {
  while (node) {
    if (node.type === "CallExpression") {
      const cle = node.callee;
      // s("...") / sound("...") — 顶级 Identifier
      if (cle.type === "Identifier" && (cle.name === "s" || cle.name === "sound")
          && node.arguments[0]?.type === "Literal"
          && typeof node.arguments[0].value === "string") {
        return node.arguments[0].value;
      }
      // 链上某个 .s("...") — MemberExpression
      if (cle.type === "MemberExpression" && cle.property?.type === "Identifier"
          && (cle.property.name === "s" || cle.property.name === "sound")
          && node.arguments[0]?.type === "Literal"
          && typeof node.arguments[0].value === "string") {
        return node.arguments[0].value;
      }
      // 继续往里 (e.g., .gain(...).bank("X") — gain 调用包着 s)
      node = cle.type === "MemberExpression" ? cle.object : null;
    } else {
      break;
    }
  }
  return null;
}

// mini DSL pattern 字符串里提取所有 drum letter token
// "bd*4" → ["bd"];  "~ ~ ~ oh" → ["oh"];  "[bd sd]*2" → ["bd","sd"];  "sh(3,8)" → ["sh"]
function extractDrumTokens(pattern) {
  if (!pattern) return [];
  // split 所有非字母字符 (数字、空格、特殊符号), 留下纯字母 token
  const raw = pattern.split(/[^a-zA-Z]+/).filter(Boolean);
  const out = new Set();
  for (const tok of raw) {
    // 排除 mini DSL 关键字 / 静音占位
    if (tok === "x" || tok === "X") continue;  // 占位符
    // 鼓字母通常 1-5 字符, 全小写
    if (tok.length <= 8 && /^[a-z]+$/.test(tok)) out.add(tok);
  }
  return [...out];
}

#!/usr/bin/env node
// 从 vendor/strudel/index.mjs 抽取所有合法的 top-level 函数名 + Pattern 方法名
// 用法: node server/lib/extract-whitelist.mjs [bundlePath] [outPath]
// 默认: vendor/strudel/index.mjs → server/lib/strudel-whitelist.json
// 由 deploy.sh 在推 server 之前调用; 校验器启动时加载产物.

import fs from "node:fs";
import path from "node:path";

const bundlePath = process.argv[2] || "vendor/strudel/index.mjs";
const outPath    = process.argv[3] || "server/lib/strudel-whitelist.json";

const txt = fs.readFileSync(bundlePath, "utf8");

// 1) 末尾 export { X as Y, ... } 块 — 拿所有公开 top-level
const topLevel = new Set();
const exportBlock = txt.match(/export\s*\{([\s\S]*?)\}\s*;?\s*$/);
if (exportBlock) {
  for (const m of exportBlock[1].matchAll(/(?:[a-zA-Z_$][a-zA-Z0-9_$]*\s+as\s+)?([a-zA-Z_$][a-zA-Z0-9_$]*)/g)) {
    topLevel.add(m[1]);
  }
}

// 2) XXX.prototype.YYY = 模式 — 拿所有 Pattern 方法
const methods = new Set();
for (const m of txt.matchAll(/([a-zA-Z_$][a-zA-Z0-9_$]*)\.prototype\.([a-zA-Z_$][a-zA-Z0-9_$]*)\s*=/g)) {
  methods.add(m[2]);
}

// 3) registerControl (c2) 调用 — Strudel 的 audio control (gain/lpf/freq/...) 都从这里来
//    会同时注册成 top-level 函数 + Pattern 方法
//    形态多变: c2("freq") / c2(["a","b","c"], "alias", "alias2") / ({ lpf: var } = c2(...)) 解构
//    最稳的源 = 解构 LHS, 那是真正暴露给运行时的名字
//    辅助源 = c2(...) 内所有 string literal (兼容形态)
for (const m of txt.matchAll(/\(\s*\{([^}]+?)\}\s*=\s*c2\(/g)) {
  for (const pair of m[1].matchAll(/([a-zA-Z_$][a-zA-Z0-9_$]*)\s*:/g)) {
    topLevel.add(pair[1]);
    methods.add(pair[1]);
  }
}
// c2(...) 内所有 string literal — 注意 [^)] 不跨嵌套 paren 但 c2 args 不会嵌套, 足够
for (const m of txt.matchAll(/\bc2\(([^)]+)\)/g)) {
  for (const nm of m[1].matchAll(/['"]([a-zA-Z_$][a-zA-Z0-9_$]*)['"]/g)) {
    topLevel.add(nm[1]);
    methods.add(nm[1]);
  }
}

// 4) register('name', ...) — Strudel 的另一个注册路径 (functional patterns 用)
for (const m of txt.matchAll(/\bregister\(\s*['"]([a-zA-Z_$][a-zA-Z0-9_$]*)['"]/g)) {
  topLevel.add(m[1]);
  methods.add(m[1]);
}

// 5) MINIFIED register — bundle 里 register 被压缩成单字母函数 (l/m/n/...). 形态:
//    Ow = l("sometimes", function(t, e) { ... })
//    ({ every: Md } = l(["firstOf", "every"], function(...) { ... }))
//    特征是 "fn(stringOrArray, function..." 这个 signature 几乎只能是 register
// Note: 不限制第二参数必须是 `function` 关键字 — Strudel 大量用箭头函数 (= l("swing", (t,e) => ...))
for (const m of txt.matchAll(/=\s*[a-zA-Z_$][a-zA-Z0-9_$]*\(\s*['"]([a-zA-Z_$][a-zA-Z0-9_$]*)['"]\s*,/g)) {
  topLevel.add(m[1]);
  methods.add(m[1]);
}
for (const m of txt.matchAll(/=\s*[a-zA-Z_$][a-zA-Z0-9_$]*\(\s*\[([^\]]+)\]\s*,/g)) {
  for (const nm of m[1].matchAll(/['"]([a-zA-Z_$][a-zA-Z0-9_$]*)['"]/g)) {
    topLevel.add(nm[1]);
    methods.add(nm[1]);
  }
}

// 6) 任何解构 LHS — ({ a: x, b: y } = SomeFn(...))
//    比 register-specific 更宽; 这样能覆盖各种我们想不到的 registry helper
for (const m of txt.matchAll(/\(\s*\{([^}]+?)\}\s*=\s*[a-zA-Z_$][a-zA-Z0-9_$]*\(/g)) {
  for (const pair of m[1].matchAll(/([a-zA-Z_$][a-zA-Z0-9_$]*)\s*:/g)) {
    topLevel.add(pair[1]);
    methods.add(pair[1]);
  }
}

// 4) 解构赋值的别名也算 ({ s: us, sound: as } = c2(["s","n","gain"], "sound"))
//    上面已经覆盖了 c2 数组里的名字 + "sound" 第二参数. 但解构 LHS 的别名 (s/sound) 已经在 c2 数组里, ok.

// 6.5) evalScope({...}) / xn({...}) 形式 — Strudel 把对象里的所有 key 都写到 globalThis
//      形态: xn({ setcpm: Gt3, hush: Vt3, cpm: b2, ... })
//      key 是公开名, value 是 minified 内部 ref. 提取所有 `name: shortRef` 对.
for (const m of txt.matchAll(/\b(?:xn|evalScope)\(\s*\{([^}]+)\}\s*\)/g)) {
  for (const pair of m[1].matchAll(/([a-zA-Z_$][a-zA-Z0-9_$]*)\s*:/g)) {
    topLevel.add(pair[1]);
    methods.add(pair[1]);
  }
}

// 7) 手工补充 — JS 内置 + Strudel API 里用 object-literal shorthand 定义的方法 (regex 抓不到)
const manualTopLevel = [
  // JS 数学 / 内置 (LLM 偶尔会用)
  "Math", "Object", "Array", "JSON", "Number", "String", "Boolean",
  "parseInt", "parseFloat", "isNaN", "isFinite",
  "Set", "Map", "Promise", "Date",
];
manualTopLevel.forEach(n => topLevel.add(n));

const manualMethods = [
  // class-body / object-literal shorthand 定义的 Pattern 方法 — regex 抓不到, 全靠手列
  // 这里只列实测常用 / 文档里出现的, 漏的发现了再加
  "superimpose", "juxBy", "press", "pressBy", "linger", "compress",
  "arpWith", "chunk", "chunkBack", "inside", "outside",
  "range", "rangex", "segment", "sample",
  "color", "colour", "draw", "animate", "onPaint",
  "set", "with", "when", "succ", "fix", "tag",
  "loopAt", "loopFirst", "echo", "stut",
  "transpose", "add", "sub", "mul", "div", "mod",
  // 视觉链式方法 (大部分是 prototype 抓到的, 双保险)
  "pianoroll", "punchcard", "pitchwheel", "spiral", "wordfall",
  "scope", "tscope", "fscope", "spectrum",
  // JS 内置, Pattern 也可能继承
  "toString", "valueOf",
];
manualMethods.forEach(n => methods.add(n));

const result = {
  generated: new Date().toISOString(),
  bundlePath: path.relative(process.cwd(), bundlePath),
  topLevelCount: topLevel.size,
  methodsCount:  methods.size,
  topLevel: [...topLevel].sort(),
  methods:  [...methods].sort(),
};

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(result, null, 2));
console.log(`[whitelist] ${result.topLevelCount} top-level + ${result.methodsCount} methods → ${outPath}`);

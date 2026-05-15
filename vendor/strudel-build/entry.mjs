// 关键: 从源码 web.mjs (而非 dist/index.mjs) 入口加载,
// 这样 esbuild 会把 @strudel/core 解析为单一 node_modules 实例,
// 与 @strudel/draw 共享同一个 Pattern 类,所有视觉链式方法 (.pianoroll/.spiral/.scope 等) 才能生效。
export * from "@strudel/web/web.mjs";

// @strudel/draw 必须从 source (./index.mjs) 而非 dist/index.mjs (package.main) 拉.
// dist 是 minified, esbuild 把内部 helper 函数 (drawSpiral / drawPitchwheel 等)
// tree-shake 掉了, 留下的 prototype 方法引用这些 helper 时 ReferenceError.
// source 的每个 .mjs 在 module scope 定义 helper, esbuild 能正确保留.
import "@strudel/draw/index.mjs";

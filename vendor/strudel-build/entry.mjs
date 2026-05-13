// 关键: 从源码 web.mjs (而非 dist/index.mjs) 入口加载,
// 这样 esbuild 会把 @strudel/core 解析为单一 node_modules 实例,
// 与 @strudel/draw 共享同一个 Pattern 类,所有视觉链式方法 (.pianoroll/.spiral/.scope 等) 才能生效。
export * from "@strudel/web/web.mjs";
import "@strudel/draw";

# VibeStrudel

把自然语言"氛围"翻译成 Strudel (TidalCycles JS) 模式代码的实时现场演奏系统。

- **Vibe → Code**:中/英文指令(如 "起一段 128bpm 完整 techno"、"让 bass 撕裂")通过 Gemini / OpenAI 兼容 API 翻译成可运行的 Strudel
- **完全离线**:Strudel 引擎 + draw 包本地构建 (~1.2MB),不依赖远程 CDN
- **多源切换**:本地 / esm.sh CDN 可切,API key、模型可在 UI 配置
- **32 内置预设 + 32 社区预设**:从 strudel.cc 官方 `tunes.mjs` 自动同步
- **视觉**:`.pianoroll()` / `.punchcard()` / `.scope()` / `.spectrum()` / `.spiral()` 等链式调用,全屏 canvas overlay
- **错误高亮**:Strudel parse/runtime 错误直接定位到代码行,行号通过 CSS counter 渲染,复制不带行号
- **AUTO 模式**:编辑代码后 500ms 自动评估,下一个 cycle 起效

## 快速开始

### 0. 准备 LLM API Key

支持以下任一:
- **Gemini** — https://aistudio.google.com/app/apikey
- **OpenAI 兼容**(OpenAI / DeepSeek / Groq / Together / 本地 LM Studio / Ollama 等) — 任何提供 `/v1/chat/completions` 的端点

### 1. 拉样本(首次只跑一次)

仓库不含 ~2.8GB 的 WAV 样本,需要单独拉:

```bash
bash vendor/samples/fetch-samples.sh
```

这个脚本会从原始仓库 / strudel.cc CDN 下载 dirt-samples、tidal-drum-machines、piano、VCSL 四套样本到 `vendor/samples/`。

### 2. 启动本地服务

```bash
python3 -m http.server 4173
# 或任何静态文件服务器
```

打开 `http://localhost:4173`。

### 3. 在右上角 `API KEY` 填入 LLM 凭证

第一次会弹出设置框。Key 保存在浏览器 localStorage,不会上传。

## 重建 Strudel 引擎

如果想升级 `@strudel/web` / `@strudel/draw` 版本:

```bash
cd vendor/strudel-build
# 改 package.json 的版本号
bash build.sh
```

输出到 `vendor/strudel/index.mjs` (单文件 ~1.2MB)。

## 项目结构

```
index.html                              主入口 (HTML + CSS link + JS)
themes/default.css                      主题(:root{} 变量集中,改主题只改这里)
vendor/strudel/index.mjs                Strudel 引擎 (含 draw) 本地 bundle
vendor/strudel/assets/clockworker-*.js  Strudel worker 文件
vendor/strudel-build/                   引擎重建脚本
vendor/presets/community.json           32 个 strudel.cc 官方 tunes
vendor/presets/update-community.sh      重新拉取社区预设
vendor/samples/*.json                   样本 manifest (路径 + 元数据)
vendor/samples/dirt-samples/            基础鼓 + 808/909 (gitignore)
vendor/samples/tidal-drum-machines/     72 个鼓机 (gitignore)
vendor/samples/piano/                   Salamander Grand Piano (gitignore)
vendor/samples/VCSL/                    127 个管弦/世界乐器 (gitignore)
```

## 致谢

- [Strudel](https://strudel.cc) by Felix Roos & TidalCycles community
- [tidal-drum-machines](https://github.com/ritchse/tidal-drum-machines) by ritchse
- [VCSL](https://github.com/sgossner/VCSL) by Versilian Studios (CC0)
- Salamander Grand Piano V3 (CC-by, Alexander Holm)

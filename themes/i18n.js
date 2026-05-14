// VibeStrudel · i18n shared module
// 用法:
//   <script src="/themes/i18n.js"></script>
//   元素加 data-i18n="key" 自动替换 textContent
//   元素加 data-i18n-attr="placeholder:key, title:key2" 替换属性
//   JS 调用: I18N.t("key")
//   切换: I18N.setLang("zh"|"en"|"ja"|"fr")
(function(){
  const dict = {
    en: {
      // === Brand / nav ===
      "brand.subtitle":   "Live Pattern Translator · v1.0",
      "brand.subtitle_landing": "AI-DRIVEN COLLABORATIVE STRUDEL JAMS",
      "nav.solo":         "Solo",
      "nav.github":       "GitHub",
      "nav.how":          "How",
      "nav.lang":         "Language",

      // === LEDs ===
      "led.pwr":          "PWR",
      "led.ai":           "AI",
      "led.audio":        "AUDIO",
      "led.fault":        "FAULT",

      // === Top bar ===
      "topbar.api_key":   "API KEY",
      "party.label":      "PARTY",
      "mode.show":        "📺 SHOW",
      "mode.input":       "🎛 INPUT",

      // === Code panel ===
      "code.title":       "PATTERN · LIVE CODE",
      "code.run":         "▶ RUN",
      "code.auto":        "⟳ AUTO",
      "code.copy":        "⧉ COPY",
      "code.cycle":       "CYCLE",
      "code.standby":     "STANDBY",
      "code.live":        "LIVE",
      "code.edited":      "EDITED",
      "code.placeholder_1": "// Waiting for first instruction, or click a PRESET BANK item",
      "code.placeholder_2": "// You can also edit directly — press RUN or Ctrl/Cmd+Enter",
      "code.placeholder_3": "// e.g. \"start a full 128 BPM techno\"",

      // === Console ===
      "console.title":    "CONSOLE · VIBE I/O",
      "vibe.prompt":      "vibe>",
      "vibe.placeholder": "Describe the vibe in any language · Enter to send · Shift+Enter for newline",
      "btn.send":         "SEND",

      // === Preset bank ===
      "preset.title":     "PRESET BANK",
      "preset.tab.all":   "All",
      "preset.tab.builtin":   "Built-in",
      "preset.tab.community": "Community",
      "preset.click_to_play": "CLICK TO LOAD & PLAY",

      // === Transport ===
      "transport.label":  "TRANSPORT",
      "transport.level":  "LEVEL",
      "transport.tempo":  "TEMPO",
      "transport.play":   "Play current pattern",
      "transport.stop":   "HUSH",

      // === LLM Settings modal ===
      "llm.settings":     "LLM Settings",
      "llm.description":  "All settings are saved locally in your browser's localStorage, never uploaded.",
      "llm.provider":     "PROVIDER",
      "llm.model":        "MODEL",
      "llm.api_key":      "API KEY",
      "llm.base_url":     "BASE URL",
      "llm.openai_compat":"OPENAI compatible",
      "llm.gemini_get":   "→ get one",
      "llm.openai_hint":  "Accepts any OpenAI Chat Completions endpoint: OpenAI / DeepSeek / Groq / Together / local LM Studio / Ollama",
      "llm.show":         "SHOW",
      "llm.hide":         "HIDE",
      "llm.sample_source":"Sample Source",
      "llm.sample_hint":  "(restart required)",
      "llm.source.auto":  "AUTO",
      "llm.source.local": "Local",
      "llm.source.remote":"Remote CDN",
      "llm.source.desc":  "<b>Auto</b>: local first, fall back to CDN (recommended) · <b>Local</b>: only vendor/ offline pack · <b>Remote</b>: only jsdelivr / strudel.b-cdn.net",
      "llm.cancel":       "Cancel",
      "llm.save":         "Save",

      // === Hints modal ===
      "hints.title":      "HINTS",
      "hints.subtitle":   "Prompt templates",
      "hints.meta":       "Click any hint to insert into the input box · ESC to close",

      "err.fix_q":        "Fix?",

      // === Landing page ===
      "landing.hero_pre": "WORLD'S FIRST AI-POWERED COLLABORATIVE STRUDEL JAM",
      "landing.tagline_html": "Describe the <span class=\"hl-2\">vibe</span> in text to AI,<br>it instantly generates <span class=\"hl\">Strudel pattern code</span>,<br>a single room link — collaborators worldwide <span class=\"hl\">hear it at the same time</span>.",
      "landing.cta_primary":   "CREATE SESSION · New Room",
      "landing.cta_solo":      "SOLO MODE · Single Player",
      "landing.steps_section": "3 STEPS TO GO LIVE",
      "landing.steps_sub":     "Click → Share → Jam together",
      "landing.step1_title":   "CREATE",
      "landing.step1_desc":    "Click \"CREATE SESSION\", server returns a unique short link <code style=\"background:#0e1014;padding:1px 6px;border-radius:3px;font-family:var(--font-mono);font-size:11px;color:var(--mint)\">/app/aB3xY7Kp</code>. Redis-backed, auto-recycled after 5 min idle.",
      "landing.step2_title":   "SHARE",
      "landing.step2_desc":    "Drop the URL into any chat — WeChat, Discord, Twitter. Open Graph metadata makes the link card look nice on social.",
      "landing.step3_title":   "JAM",
      "landing.step3_desc":    "Visitors type their vibe → AI generates code → server validates → broadcasts to everyone in the same session. Auto-syncs on next cycle.",
      "landing.feat_section":  "WHY VIBESTRUDEL",
      "landing.feat_sub":      "AI collaboration for electronic music has never been this light",
      "landing.feat1.h":       "Auto-sync at next cycle",
      "landing.feat1.p":       "HTTP polling + ETag, Strudel switches smoothly at cycle boundary, no beat interrupts.",
      "landing.feat2.h":       "Any language vibe",
      "landing.feat2.p":       "\"Make the bass distort\", \"add ethereal pad\" — Gemini translates to valid Strudel.",
      "landing.feat3.h":       "Bring-your-own LLM key bypasses queue",
      "landing.feat3.p":       "Fill your own Gemini/OpenAI key — skip the global 15s rate limit, use your own quota.",
      "landing.feat4.h":       "Server-side AST validation",
      "landing.feat4.p":       "JS syntax, function whitelist, gain/pan range checks — bad code never reaches you.",
      "landing.feat5.h":       "Full-screen visuals",
      "landing.feat5.p":       ".pianoroll() / .scope() / .spectrum() / .spiral() — five visualizations overlaid on the UI.",
      "landing.feat6.h":       "Open source · self-hostable",
      "landing.feat6.p":       "Single-file client, docker compose for server, deploy in 5 minutes.",
      "landing.footer_built":  "BUILT FOR LIVECODERS · POWERED BY STRUDEL & GEMINI",
      "landing.ticker.active":  "ACTIVE SESSIONS",
      "landing.ticker.vibes":   "VIBES TODAY",
      "landing.ticker.server":  "SERVER LLM",
      "landing.ticker.budget":  "/ $30 MONTHLY BUDGET",
      "landing.ticker.redis":   "REDIS-BACKED · NO DISK PERSISTENCE",
      "landing.ticker.ttl":     "5-MIN IDLE TTL",
      "landing.sc.label":       "SESSION READY · Room is open · Copy and share",
      "landing.sc.copy":        "COPY",
      "landing.sc.copied":      "✓ COPIED",
      "landing.sc.enter":       "ENTER ROOM ▸",
      "landing.sc.new":         "↻ NEW",
      "landing.sc.tip":         "Auto-recycled after 5 minutes of inactivity",
      "landing.qr.tip":         "📱 Scan any QR code with your phone to join",
      "landing.qr.party":       "PARTY · Full",
      "landing.qr.show":        "SHOW · Display",
      "landing.qr.input":       "INPUT · Controller",
      "landing.creating":       "CREATING SESSION...",
      "landing.create_another": "CREATE ANOTHER",
      "landing.create_failed":  "CREATE FAILED · Retry",
    },

    zh: {
      "brand.subtitle":   "Live Pattern Translator · v1.0",
      "brand.subtitle_landing": "AI 协作 Strudel 即兴系统",
      "nav.solo":         "单机",
      "nav.github":       "GitHub",
      "nav.how":          "原理",
      "nav.lang":         "语言",

      "led.pwr":          "电源",
      "led.ai":           "AI",
      "led.audio":        "音频",
      "led.fault":        "故障",

      "topbar.api_key":   "API 密钥",
      "party.label":      "派对",
      "mode.show":        "📺 显示",
      "mode.input":       "🎛 输入",

      "code.title":       "代码 · 实时模式",
      "code.run":         "▶ 执行",
      "code.auto":        "⟳ 自动",
      "code.copy":        "⧉ 复制",
      "code.cycle":       "周期",
      "code.standby":     "待机",
      "code.live":        "运行中",
      "code.edited":      "已编辑",
      "code.placeholder_1": "// 等待第一条指令,或点 PRESET BANK 中的预设",
      "code.placeholder_2": "// 这里也可以直接编辑 — 改完按 RUN 或 Ctrl/Cmd + Enter",
      "code.placeholder_3": "// 例如: \"起一段 128 BPM 的完整 techno\"",

      "console.title":    "控制台 · 氛围 I/O",
      "vibe.prompt":      "氛围>",
      "vibe.placeholder": "用任意语言描述你想要的氛围 · 回车发送 · Shift+Enter 换行",
      "btn.send":         "发送",

      "preset.title":     "预设音色库",
      "preset.tab.all":   "全部",
      "preset.tab.builtin":   "内置",
      "preset.tab.community": "社区",
      "preset.click_to_play": "点击加载并播放",

      "transport.label":  "走带",
      "transport.level":  "电平",
      "transport.tempo":  "速度",
      "transport.play":   "播放当前模式",
      "transport.stop":   "静音",

      "llm.settings":     "LLM 设置",
      "llm.description":  "所有配置仅保存在你浏览器的 localStorage 中,不会上传任何服务器。",
      "llm.provider":     "供应商",
      "llm.model":        "模型",
      "llm.api_key":      "API 密钥",
      "llm.base_url":     "BASE URL",
      "llm.openai_compat":"OPENAI 兼容",
      "llm.gemini_get":   "→ 获取",
      "llm.openai_hint":  "兼容任何 OpenAI Chat Completions 格式: OpenAI / DeepSeek / Groq / Together / 本地 LM Studio / Ollama 等",
      "llm.show":         "显示",
      "llm.hide":         "隐藏",
      "llm.sample_source":"样本源",
      "llm.sample_hint":  "(切换需刷新页面生效)",
      "llm.source.auto":  "AUTO",
      "llm.source.local": "本地",
      "llm.source.remote":"远程 CDN",
      "llm.source.desc":  "<b>Auto</b>: 优先本地,失败回落 CDN(推荐) · <b>本地</b>: 只用 vendor/ 离线包 · <b>远程</b>: 只用 jsdelivr / strudel.b-cdn.net",
      "llm.cancel":       "取消",
      "llm.save":         "保存",

      "hints.title":      "提示词",
      "hints.subtitle":   "模板库",
      "hints.meta":       "点击任意提示插入到输入框 · ESC 关闭",

      "err.fix_q":        "修复?",

      "landing.hero_pre": "全球首个 AI 协作 Strudel 即兴系统",
      "landing.tagline_html": "把氛围(<span class=\"hl-2\">Vibe</span>)用文字描述给 AI,<br>它即时生成 <span class=\"hl\">Strudel 模式代码</span>,<br>一个房间链接 — 全球协作者 <span class=\"hl\">同时听到</span>同一首正在演化的电子乐 jam。",
      "landing.cta_primary":   "CREATE SESSION · 创建房间",
      "landing.cta_solo":      "SOLO MODE · 单机",
      "landing.steps_section": "三步开张",
      "landing.steps_sub":     "点击 → 分享 → 一起 jam",
      "landing.step1_title":   "创建",
      "landing.step1_desc":    "点 \"CREATE SESSION\",服务器返回一个唯一短链接 <code style=\"background:#0e1014;padding:1px 6px;border-radius:3px;font-family:var(--font-mono);font-size:11px;color:var(--mint)\">/app/aB3xY7Kp</code>。Redis 后端,5 分钟无活动自动回收。",
      "landing.step2_title":   "分享",
      "landing.step2_desc":    "把 URL 发到任何聊天 — 微信、Discord、Twitter。Open Graph 元数据让链接卡片在社交平台显示得很好看。",
      "landing.step3_title":   "协作",
      "landing.step3_desc":    "访问者输入文字描述氛围 → AI 生成代码 → 服务端校验 → 广播给同 session 所有人。下个 cycle 自动同步起效。",
      "landing.feat_section":  "为什么用",
      "landing.feat_sub":      "用 AI 协作做电子乐,从未这么轻量",
      "landing.feat1.h":       "下一个 cycle 自动接入",
      "landing.feat1.p":       "HTTP 轮询 + ETag,Strudel 在 cycle 边界平滑切换,不打断节奏。",
      "landing.feat2.h":       "中英文都行",
      "landing.feat2.p":       "\"让 bass 撕裂\"、\"加点空灵 pad\" — Gemini 翻译为合法 Strudel。",
      "landing.feat3.h":       "自带 LLM key 旁路队列",
      "landing.feat3.p":       "填自己的 Gemini/OpenAI key,不受全局 15 秒频率限制,独享额度。",
      "landing.feat4.h":       "服务端 AST 校验",
      "landing.feat4.p":       "JS 语法、函数白名单、超界 gain/pan 全挡掉,确保播放不崩。",
      "landing.feat5.h":       "全屏可视化",
      "landing.feat5.p":       ".pianoroll() / .scope() / .spectrum() / .spiral() — 五种视觉叠加在 UI 上。",
      "landing.feat6.h":       "完全开源 · 可自部署",
      "landing.feat6.p":       "客户端单 HTML,服务端 docker compose 一键起,自部署 5 分钟搞定。",
      "landing.footer_built":  "为 livecoder 而建 · 基于 STRUDEL 与 GEMINI",
      "landing.ticker.active":  "活跃 SESSION",
      "landing.ticker.vibes":   "今日 VIBES",
      "landing.ticker.server":  "服务器 LLM",
      "landing.ticker.budget":  "/ $30 月度预算",
      "landing.ticker.redis":   "REDIS 后端 · 无磁盘持久化",
      "landing.ticker.ttl":     "5 分钟空闲 TTL",
      "landing.sc.label":       "SESSION READY · 房间已开 · 请复制并分享",
      "landing.sc.copy":        "复制",
      "landing.sc.copied":      "✓ 已复制",
      "landing.sc.enter":       "进入房间 ▸",
      "landing.sc.new":         "↻ 重新创建",
      "landing.sc.tip":         "5 分钟内无任何活动会自动回收",
      "landing.qr.tip":         "📱 手机扫描任一二维码即可加入",
      "landing.qr.party":       "PARTY · 完整",
      "landing.qr.show":        "SHOW · 大屏",
      "landing.qr.input":       "INPUT · 控制",
      "landing.creating":       "正在创建 SESSION...",
      "landing.create_another": "再开一个",
      "landing.create_failed":  "创建失败 · 重试",
    },

    ja: {
      "brand.subtitle":   "Live Pattern Translator · v1.0",
      "brand.subtitle_landing": "AI共作型 Strudel ジャムシステム",
      "nav.solo":         "ソロ",
      "nav.github":       "GitHub",
      "nav.how":          "仕組み",
      "nav.lang":         "言語",

      "led.pwr":          "電源",
      "led.ai":           "AI",
      "led.audio":        "音声",
      "led.fault":        "故障",

      "topbar.api_key":   "API キー",
      "party.label":      "パーティ",
      "mode.show":        "📺 表示",
      "mode.input":       "🎛 入力",

      "code.title":       "パターン · ライブコード",
      "code.run":         "▶ 実行",
      "code.auto":        "⟳ 自動",
      "code.copy":        "⧉ コピー",
      "code.cycle":       "サイクル",
      "code.standby":     "待機",
      "code.live":        "再生中",
      "code.edited":      "編集済",
      "code.placeholder_1": "// 最初の指示を待っているか、PRESET BANK から選択してください",
      "code.placeholder_2": "// ここを直接編集することもできます — RUN または Ctrl/Cmd+Enter で実行",
      "code.placeholder_3": "// 例: 「128 BPM のフル techno を作る」",

      "console.title":    "コンソール · VIBE I/O",
      "vibe.prompt":      "vibe>",
      "vibe.placeholder": "好きな言語で雰囲気を入力 · Enter で送信 · Shift+Enter で改行",
      "btn.send":         "送信",

      "preset.title":     "プリセット",
      "preset.tab.all":   "全て",
      "preset.tab.builtin":   "内蔵",
      "preset.tab.community": "コミュニティ",
      "preset.click_to_play": "クリックして読み込み再生",

      "transport.label":  "トランスポート",
      "transport.level":  "レベル",
      "transport.tempo":  "テンポ",
      "transport.play":   "現在のパターンを再生",
      "transport.stop":   "ミュート",

      "llm.settings":     "LLM 設定",
      "llm.description":  "全ての設定はブラウザの localStorage に保存され、サーバーには送信されません。",
      "llm.provider":     "プロバイダー",
      "llm.model":        "モデル",
      "llm.api_key":      "API キー",
      "llm.base_url":     "BASE URL",
      "llm.openai_compat":"OPENAI 互換",
      "llm.gemini_get":   "→ 取得",
      "llm.openai_hint":  "OpenAI Chat Completions 形式の任意のエンドポイント: OpenAI / DeepSeek / Groq / Together / ローカル LM Studio / Ollama など",
      "llm.show":         "表示",
      "llm.hide":         "隠す",
      "llm.sample_source":"サンプルソース",
      "llm.sample_hint":  "(変更後はリロードが必要)",
      "llm.source.auto":  "AUTO",
      "llm.source.local": "ローカル",
      "llm.source.remote":"リモート CDN",
      "llm.source.desc":  "<b>Auto</b>: ローカル優先、失敗時 CDN にフォールバック (推奨) · <b>ローカル</b>: vendor/ オフラインパックのみ · <b>リモート</b>: jsdelivr / strudel.b-cdn.net のみ",
      "llm.cancel":       "キャンセル",
      "llm.save":         "保存",

      "hints.title":      "ヒント",
      "hints.subtitle":   "テンプレート集",
      "hints.meta":       "クリックで入力欄に挿入 · ESC で閉じる",

      "err.fix_q":        "修正?",

      "landing.hero_pre": "世界初の AI 共作型 Strudel ジャム",
      "landing.tagline_html": "雰囲気 (<span class=\"hl-2\">vibe</span>) を AI にテキストで伝えると、<br>即座に <span class=\"hl\">Strudel パターンコード</span>を生成、<br>1 つのルーム URL — 世界中の協力者が <span class=\"hl\">同時に</span>進化する電子音楽を聴く。",
      "landing.cta_primary":   "CREATE SESSION · ルーム作成",
      "landing.cta_solo":      "SOLO MODE · ソロ",
      "landing.steps_section": "3 ステップで開始",
      "landing.steps_sub":     "クリック → 共有 → 一緒にジャム",
      "landing.step1_title":   "作成",
      "landing.step1_desc":    "\"CREATE SESSION\" を押すと、サーバーから一意の短いリンク <code style=\"background:#0e1014;padding:1px 6px;border-radius:3px;font-family:var(--font-mono);font-size:11px;color:var(--mint)\">/app/aB3xY7Kp</code> が返ります。Redis ベース、5 分間無操作で自動回収。",
      "landing.step2_title":   "共有",
      "landing.step2_desc":    "URL を任意のチャットへ — WeChat、Discord、Twitter。Open Graph メタデータで SNS のリンクカードも綺麗。",
      "landing.step3_title":   "ジャム",
      "landing.step3_desc":    "参加者が雰囲気を入力 → AI がコード生成 → サーバー検証 → 同セッション全員へ配信。次サイクルで自動同期。",
      "landing.feat_section":  "なぜ VIBESTRUDEL か",
      "landing.feat_sub":      "電子音楽の AI 共作がこれほど軽量だったことはない",
      "landing.feat1.h":       "次サイクルで自動同期",
      "landing.feat1.p":       "HTTP ポーリング + ETag、Strudel はサイクル境界でスムーズに切替、リズム途切れなし。",
      "landing.feat2.h":       "どの言語でも OK",
      "landing.feat2.p":       "「bass を歪ませる」「空虚な pad を追加」 — Gemini が有効な Strudel に翻訳。",
      "landing.feat3.h":       "自分の LLM キーでキュー回避",
      "landing.feat3.p":       "Gemini/OpenAI キーを入力 → 15 秒のグローバル制限なし、自分の枠を使用。",
      "landing.feat4.h":       "サーバー側 AST 検証",
      "landing.feat4.p":       "JS 構文、関数ホワイトリスト、gain/pan 範囲チェック — 不正コードは届かない。",
      "landing.feat5.h":       "全画面ビジュアル",
      "landing.feat5.p":       ".pianoroll() / .scope() / .spectrum() / .spiral() — UI に重ねて 5 種類の可視化。",
      "landing.feat6.h":       "オープンソース · セルフホスト可能",
      "landing.feat6.p":       "クライアントは単一 HTML、サーバーは docker compose で 5 分デプロイ。",
      "landing.footer_built":  "LIVECODER のために · STRUDEL & GEMINI で駆動",
      "landing.ticker.active":  "アクティブ SESSION",
      "landing.ticker.vibes":   "本日の VIBES",
      "landing.ticker.server":  "サーバー LLM",
      "landing.ticker.budget":  "/ $30 月間予算",
      "landing.ticker.redis":   "REDIS バックエンド · ディスク永続化なし",
      "landing.ticker.ttl":     "5 分のアイドル TTL",
      "landing.sc.label":       "SESSION READY · ルーム作成済 · コピーして共有",
      "landing.sc.copy":        "コピー",
      "landing.sc.copied":      "✓ コピー済",
      "landing.sc.enter":       "ルームへ ▸",
      "landing.sc.new":         "↻ 新規",
      "landing.sc.tip":         "5 分間操作がないと自動回収されます",
      "landing.qr.tip":         "📱 スマホで QR をスキャンして参加",
      "landing.qr.party":       "PARTY · フル",
      "landing.qr.show":        "SHOW · 表示",
      "landing.qr.input":       "INPUT · 操作",
      "landing.creating":       "SESSION 作成中...",
      "landing.create_another": "もう 1 つ作成",
      "landing.create_failed":  "作成失敗 · 再試行",
    },

    fr: {
      "brand.subtitle":   "Live Pattern Translator · v1.0",
      "brand.subtitle_landing": "JAMS STRUDEL COLLABORATIVES PAR IA",
      "nav.solo":         "Solo",
      "nav.github":       "GitHub",
      "nav.how":          "Comment",
      "nav.lang":         "Langue",

      "led.pwr":          "PWR",
      "led.ai":           "IA",
      "led.audio":        "AUDIO",
      "led.fault":        "ERREUR",

      "topbar.api_key":   "CLÉ API",
      "party.label":      "PARTY",
      "mode.show":        "📺 SHOW",
      "mode.input":       "🎛 INPUT",

      "code.title":       "MOTIF · CODE EN DIRECT",
      "code.run":         "▶ LANCER",
      "code.auto":        "⟳ AUTO",
      "code.copy":        "⧉ COPIER",
      "code.cycle":       "CYCLE",
      "code.standby":     "EN ATTENTE",
      "code.live":        "EN DIRECT",
      "code.edited":      "MODIFIÉ",
      "code.placeholder_1": "// En attente du premier prompt, ou choisissez un preset",
      "code.placeholder_2": "// Vous pouvez aussi éditer ici — RUN ou Ctrl/Cmd+Enter pour exécuter",
      "code.placeholder_3": "// Ex : « lance un techno complet à 128 BPM »",

      "console.title":    "CONSOLE · VIBE I/O",
      "vibe.prompt":      "vibe>",
      "vibe.placeholder": "Décrivez l'ambiance dans n'importe quelle langue · Entrée pour envoyer · Shift+Entrée pour ligne",
      "btn.send":         "ENVOYER",

      "preset.title":     "BANQUE DE PRESETS",
      "preset.tab.all":   "Tous",
      "preset.tab.builtin":   "Intégrés",
      "preset.tab.community": "Communauté",
      "preset.click_to_play": "CLIQUER POUR CHARGER",

      "transport.label":  "TRANSPORT",
      "transport.level":  "NIVEAU",
      "transport.tempo":  "TEMPO",
      "transport.play":   "Lire le motif actuel",
      "transport.stop":   "MUET",

      "llm.settings":     "Paramètres LLM",
      "llm.description":  "Tous les réglages sont stockés localement dans le localStorage de votre navigateur, jamais envoyés.",
      "llm.provider":     "FOURNISSEUR",
      "llm.model":        "MODÈLE",
      "llm.api_key":      "CLÉ API",
      "llm.base_url":     "BASE URL",
      "llm.openai_compat":"OPENAI compatible",
      "llm.gemini_get":   "→ obtenir",
      "llm.openai_hint":  "Accepte toute API au format Chat Completions OpenAI : OpenAI / DeepSeek / Groq / Together / LM Studio local / Ollama",
      "llm.show":         "MONTRER",
      "llm.hide":         "MASQUER",
      "llm.sample_source":"Source d'échantillons",
      "llm.sample_hint":  "(redémarrage requis)",
      "llm.source.auto":  "AUTO",
      "llm.source.local": "Local",
      "llm.source.remote":"CDN distant",
      "llm.source.desc":  "<b>Auto</b> : local d'abord, fallback CDN (recommandé) · <b>Local</b> : uniquement vendor/ · <b>Distant</b> : uniquement jsdelivr / strudel.b-cdn.net",
      "llm.cancel":       "Annuler",
      "llm.save":         "Enregistrer",

      "hints.title":      "INSPIRATIONS",
      "hints.subtitle":   "Modèles de prompts",
      "hints.meta":       "Cliquer pour insérer dans le champ · ESC pour fermer",

      "err.fix_q":        "Corriger?",

      "landing.hero_pre": "PREMIER JAM STRUDEL COLLABORATIF ALIMENTÉ PAR IA",
      "landing.tagline_html": "Décrivez le <span class=\"hl-2\">vibe</span> à une IA,<br>elle génère instantanément du <span class=\"hl\">code Strudel</span>,<br>un seul lien — tout le monde entend <span class=\"hl\">la même jam électronique</span> évoluer en temps réel.",
      "landing.cta_primary":   "CREATE SESSION · Créer une room",
      "landing.cta_solo":      "SOLO MODE · Mode solo",
      "landing.steps_section": "3 ÉTAPES POUR DÉMARRER",
      "landing.steps_sub":     "Cliquer → Partager → Jammer ensemble",
      "landing.step1_title":   "CRÉER",
      "landing.step1_desc":    "Cliquez sur « CREATE SESSION », le serveur renvoie un lien court unique <code style=\"background:#0e1014;padding:1px 6px;border-radius:3px;font-family:var(--font-mono);font-size:11px;color:var(--mint)\">/app/aB3xY7Kp</code>. Backend Redis, recyclage automatique après 5 min d'inactivité.",
      "landing.step2_title":   "PARTAGER",
      "landing.step2_desc":    "Envoyez l'URL dans n'importe quel chat — WeChat, Discord, Twitter. Les métadonnées Open Graph donnent un beau preview.",
      "landing.step3_title":   "JAMMER",
      "landing.step3_desc":    "Les visiteurs saisissent leur vibe → l'IA génère du code → le serveur valide → diffusion à tous dans la session. Sync auto au prochain cycle.",
      "landing.feat_section":  "POURQUOI VIBESTRUDEL",
      "landing.feat_sub":      "La collaboration IA pour la musique électronique n'a jamais été aussi légère",
      "landing.feat1.h":       "Sync auto au prochain cycle",
      "landing.feat1.p":       "Polling HTTP + ETag, Strudel bascule en douceur à la frontière du cycle, sans coupure de rythme.",
      "landing.feat2.h":       "Vibe en n'importe quelle langue",
      "landing.feat2.p":       "« Distortion sur la basse », « pad éthéré » — Gemini traduit en Strudel valide.",
      "landing.feat3.h":       "BYOK pour éviter la queue",
      "landing.feat3.p":       "Mettez votre propre clé Gemini/OpenAI — pas de limite globale de 15 s, votre quota.",
      "landing.feat4.h":       "Validation AST côté serveur",
      "landing.feat4.p":       "Syntaxe JS, liste blanche, contrôle gain/pan — pas de code cassé chez vous.",
      "landing.feat5.h":       "Visuels plein écran",
      "landing.feat5.p":       ".pianoroll() / .scope() / .spectrum() / .spiral() — 5 visualisations superposées.",
      "landing.feat6.h":       "Open source · auto-hébergeable",
      "landing.feat6.p":       "Client en un seul HTML, serveur en docker compose, déploiement en 5 min.",
      "landing.footer_built":  "POUR LES LIVECODERS · PROPULSÉ PAR STRUDEL & GEMINI",
      "landing.ticker.active":  "SESSIONS ACTIVES",
      "landing.ticker.vibes":   "VIBES AUJOURD'HUI",
      "landing.ticker.server":  "LLM SERVEUR",
      "landing.ticker.budget":  "/ $30 BUDGET MENSUEL",
      "landing.ticker.redis":   "BACKEND REDIS · PAS DE PERSISTANCE DISQUE",
      "landing.ticker.ttl":     "TTL DE 5 MIN",
      "landing.sc.label":       "SESSION PRÊTE · Copiez et partagez",
      "landing.sc.copy":        "COPIER",
      "landing.sc.copied":      "✓ COPIÉ",
      "landing.sc.enter":       "ENTRER ▸",
      "landing.sc.new":         "↻ NOUVEAU",
      "landing.sc.tip":         "Recyclée après 5 minutes d'inactivité",
      "landing.qr.tip":         "📱 Scannez n'importe quel QR avec votre téléphone",
      "landing.qr.party":       "PARTY · Complet",
      "landing.qr.show":        "SHOW · Affichage",
      "landing.qr.input":       "INPUT · Contrôleur",
      "landing.creating":       "CRÉATION DE LA SESSION...",
      "landing.create_another": "EN CRÉER UNE AUTRE",
      "landing.create_failed":  "ÉCHEC · Réessayer",
    },
  };

  const SUPPORTED = ["en","zh","ja","fr"];
  const NAMES = { en: "English", zh: "中文", ja: "日本語", fr: "Français" };
  const LS_KEY = "vibestrudel.lang";

  function detect(){
    const stored = localStorage.getItem(LS_KEY);
    if (stored && SUPPORTED.includes(stored)) return stored;
    const sys = (navigator.language || "en").toLowerCase();
    if (sys.startsWith("zh")) return "zh";
    if (sys.startsWith("ja")) return "ja";
    if (sys.startsWith("fr")) return "fr";
    return "en";
  }

  const LANG = detect();
  document.documentElement.lang = LANG;

  function t(key, ...args){
    let s = dict[LANG]?.[key];
    if (s == null) s = dict.en[key];
    if (s == null) return key;
    args.forEach((v, i) => s = s.replaceAll(`{${i}}`, v));
    return s;
  }

  function setLang(lang){
    if (!SUPPORTED.includes(lang)) return;
    localStorage.setItem(LS_KEY, lang);
    location.reload();
  }

  function apply(root){
    root = root || document;
    root.querySelectorAll("[data-i18n]").forEach(el => {
      const key = el.getAttribute("data-i18n");
      const val = t(key);
      // 允许 HTML(用于带样式的字符串)
      el.innerHTML = val;
    });
    root.querySelectorAll("[data-i18n-attr]").forEach(el => {
      const spec = el.getAttribute("data-i18n-attr");
      spec.split(",").forEach(pair => {
        const [attr, key] = pair.split(":").map(s => s.trim());
        if (attr && key) el.setAttribute(attr, t(key));
      });
    });
  }

  function renderSwitcher(container){
    const wrap = typeof container === "string" ? document.querySelector(container) : container;
    if (!wrap) return;
    const cur = LANG;
    wrap.innerHTML = "";
    const select = document.createElement("select");
    select.className = "lang-select";
    select.title = t("nav.lang");
    SUPPORTED.forEach(code => {
      const opt = document.createElement("option");
      opt.value = code; opt.textContent = NAMES[code];
      if (code === cur) opt.selected = true;
      select.appendChild(opt);
    });
    select.addEventListener("change", e => setLang(e.target.value));
    wrap.appendChild(select);
  }

  window.I18N = { t, setLang, apply, renderSwitcher, lang: LANG, SUPPORTED, NAMES };

  // Auto apply on DOM ready
  if (document.readyState === "loading"){
    document.addEventListener("DOMContentLoaded", () => apply());
  } else {
    apply();
  }
})();

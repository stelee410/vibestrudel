#!/bin/bash
# 从 strudel.cc 官方仓库拉最新 tunes.mjs 并转成 community.json
# 用法: bash vendor/presets/update-community.sh
set -e
cd "$(dirname "$0")"

URL="https://codeberg.org/uzu/strudel/raw/branch/main/website/src/repl/tunes.mjs"
TMP="/tmp/tunes-$(date +%s).mjs"

echo "→ 下载 $URL"
curl -fsSL "$URL" -o "$TMP"
echo "  size: $(wc -c < "$TMP") bytes"

python3 << PYEOF
import re, json, sys

with open("$TMP") as f:
    src = f.read()

pattern = re.compile(r'export const (\w+) = \`\n?(.*?)\`\s*;?', re.DOTALL)
tunes = []
for m in pattern.finditer(src):
    name = m.group(1)
    code = m.group(2).strip()
    bpm = 120
    bpm_m = re.search(r'setcpm\(\s*(\d+(?:\.\d+)?)\s*(?:/\s*(\d+(?:\.\d+)?))?\s*\)', code)
    if bpm_m:
        n = float(bpm_m.group(1))
        d = float(bpm_m.group(2)) if bpm_m.group(2) else 1
        bpm_calc = round(n/d * 4)
        if 40 <= bpm_calc <= 240: bpm = bpm_calc
    display = re.sub(r'([A-Z])', r' \1', name).strip().upper()
    tunes.append({"name": display, "bpm": bpm, "code": code, "source": "community", "id": name})

with open("community.json","w") as f:
    json.dump({"_source":"strudel.cc tunes.mjs","_version":"1.0","tunes":tunes}, f, ensure_ascii=False, indent=1)
print(f"✓ 解析 {len(tunes)} 个 tunes,写入 community.json")
PYEOF

rm "$TMP"
ls -lh community.json

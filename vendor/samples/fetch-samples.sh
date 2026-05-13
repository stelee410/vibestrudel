#!/bin/bash
# VibeStrudel 样本下载脚本
# 用法: bash vendor/samples/fetch-samples.sh
# 目标体积: ~3.3GB (dirt-samples 227MB + tidal-drum-machines 223MB + piano 5MB + VCSL 2.8GB)
set -e
cd "$(dirname "$0")"

MIRROR="${GH_MIRROR:-https://gh-proxy.com/}"   # 可改成 https://github.com/ 走原站
CDN="https://strudel.b-cdn.net"

# ---- 1. dirt-samples (从 GitHub tarball) ----
if [ ! -d dirt-samples/bd ]; then
  echo "→ dirt-samples"
  curl -fL --retry 5 "${MIRROR}https://github.com/tidalcycles/dirt-samples/archive/refs/heads/master.tar.gz" -o /tmp/dirt-samples.tar.gz
  tar -xzf /tmp/dirt-samples.tar.gz
  # 解压出来叫 Dirt-Samples-master,移动到 dirt-samples/ (保留已有的 strudel.json)
  cp dirt-samples/strudel.json /tmp/strudel-dirt.json
  rm -rf dirt-samples
  mv Dirt-Samples-master dirt-samples
  mv /tmp/strudel-dirt.json dirt-samples/strudel.json
  rm /tmp/dirt-samples.tar.gz
fi

# ---- 2. tidal-drum-machines (从 GitHub tarball) ----
if [ ! -d tidal-drum-machines/machines ]; then
  echo "→ tidal-drum-machines"
  curl -fL --retry 5 "${MIRROR}https://github.com/ritchse/tidal-drum-machines/archive/refs/heads/main.tar.gz" -o /tmp/tdm.tar.gz
  tar -xzf /tmp/tdm.tar.gz
  mv tidal-drum-machines-main tidal-drum-machines
  rm /tmp/tdm.tar.gz
fi

# ---- 3. piano (从 strudel CDN, mp3 文件) ----
if [ ! -d piano ] || [ -z "$(ls -A piano 2>/dev/null)" ]; then
  echo "→ piano"
  mkdir -p piano
  python3 -c "
import json, urllib.request, urllib.parse, os, sys
with open('piano.json') as f: m = json.load(f)
files = set()
def collect(v):
    if isinstance(v, str): files.add(v)
    elif isinstance(v, list):
        for x in v: collect(x)
    elif isinstance(v, dict):
        for x in v.values(): collect(x)
for k,v in m.items():
    if not k.startswith('_'): collect(v)
for p in sorted(files):
    out = os.path.join('piano', p)
    if os.path.exists(out): continue
    os.makedirs(os.path.dirname(out), exist_ok=True)
    enc = urllib.parse.quote(p)
    import subprocess
    subprocess.run(['curl','-fsSL','--max-time','30','-o',out,'$CDN/piano/'+enc], check=False)
    print('.', end='', flush=True)
print(' done')
"
fi

# ---- 4. VCSL (从 strudel CDN, ~2.8GB,慢) ----
if [ ! -d VCSL ] || [ "$(find VCSL -type f 2>/dev/null | wc -l)" -lt 1800 ]; then
  echo "→ VCSL (大,可能需要 10-20 分钟,跳过请 Ctrl+C 然后注释这段)"
  python3 -c "
import json, urllib.parse, os, subprocess, concurrent.futures
with open('vcsl.json') as f: m = json.load(f)
files = set()
def collect(v):
    if isinstance(v, str): files.add(v)
    elif isinstance(v, list):
        for x in v: collect(x)
    elif isinstance(v, dict):
        for x in v.values(): collect(x)
for k,v in m.items():
    if not k.startswith('_'): collect(v)
print(f'拉取 {len(files)} 个 VCSL 文件...')
def fetch(p):
    decoded = urllib.parse.unquote(p)
    out = os.path.join('VCSL', decoded)
    if os.path.exists(out) and os.path.getsize(out) > 0: return ('skip', p)
    os.makedirs(os.path.dirname(out), exist_ok=True)
    encoded = urllib.parse.quote(urllib.parse.unquote(p), safe='/')
    url = '$CDN/VCSL/' + encoded
    r = subprocess.run(['curl','-fsSL','--max-time','30','-o',out,url], capture_output=True)
    return ('ok' if r.returncode == 0 else 'fail', p)
ok=fail=skip=0
with concurrent.futures.ThreadPoolExecutor(max_workers=20) as ex:
    for i,(s,p) in enumerate(ex.map(fetch, files),1):
        if s == 'ok': ok+=1
        elif s == 'skip': skip+=1
        else: fail+=1
        if i % 200 == 0: print(f'  [{i}/{len(files)}] ok={ok} skip={skip} fail={fail}')
print(f'VCSL 完成: ok={ok} skip={skip} fail={fail}')
"
fi

echo ""
echo "✓ 所有样本就位"
du -sh dirt-samples tidal-drum-machines piano VCSL 2>/dev/null

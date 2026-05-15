#!/bin/bash
# 验证 ../strudel/index.mjs bundle 完整性 — 防降级回归
# 跑在 build.sh 之后, 任何关键能力缺失就 exit 1, 阻止 deploy.
set -e
BUNDLE="$(dirname "$0")/../strudel/index.mjs"
[ -f "$BUNDLE" ] || { echo "✗ bundle 不存在: $BUNDLE"; exit 1; }

fail=0
need(){
  local name="$1" pattern="$2"
  local count=$(grep -c "$pattern" "$BUNDLE" || true)
  if [ "$count" -lt 1 ]; then
    echo "✗ MISSING: $name  (regex: $pattern)"
    fail=1
  else
    echo "✓ $name ($count occurrences)"
  fi
}

echo "=== Worklet processors (audio engine 关键) ==="
need "lfo-processor"        "lfo-processor"
need "envelope-processor"   "envelope-processor"
need "ladder-processor"     "ladder-processor"
need "AudioWorkletProcessor inline" "AudioWorkletProcessor"

echo
echo "=== Visual prototype methods (用户能调的视觉函数) ==="
need ".prototype.pianoroll"   "prototype\.pianoroll"
need ".prototype.punchcard"   "prototype\.punchcard"
need ".prototype.spiral"      "prototype\.spiral"
need ".prototype.wordfall"    "prototype\.wordfall"
need ".prototype.pitchwheel"  "prototype\.pitchwheel"
need ".prototype.scope"       "prototype\.scope"
need ".prototype.spectrum"    "prototype\.spectrum"
need ".prototype.fscope"      "prototype\.fscope"
need ".prototype.onPaint"     "prototype\.onPaint"

echo
echo "=== Visual helper functions (上次 regression 就是丢这些) ==="
need "fromPolar (spiral helper)"  "fromPolar"
need "drawSpiral or spiralSegment" "drawSpiral\|spiralSegment"
need "pianoroll drawing helper"    "__pianoroll\|drawPianoroll"

echo
echo "=== Top-level exports / globals ==="
need "initStrudel"            "initStrudel"
need "samples loader"         "samples:\|samples,\|samples as\|window\.samples"
need "evaluate"               "evaluate"
need "hush"                   "hush"
need "setcpm/cpm"             "setcpm\|setCpm"

echo
if [ "$fail" -ne 0 ]; then
  echo "✗ Bundle verify FAILED — fix build before deploying!"
  exit 1
fi
echo "✓ Bundle verify PASSED ($(wc -c < "$BUNDLE" | tr -d ' ') bytes)"

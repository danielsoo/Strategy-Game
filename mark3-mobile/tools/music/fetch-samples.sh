#!/usr/bin/env bash
# 배경음을 굽는 데 쓰는 실제 악기 표본을 받는다 (저장소에는 넣지 않는다 — 130MB 넘는다).
#   tonejs-instruments (MIT)      — 독주 악기 표본
#   soundfont-for-samplers (MIT)  — FluidR3 GM (Frank Wen, MIT): 현악 합주·비올라·오보에·
#                                   잉글리시 호른·피콜로·팀파니·관현악 타악기 등
# 쓰는 법: bash tools/music/fetch-samples.sh <받을 폴더>
set -euo pipefail
OUT="${1:-/tmp/mark3-music}"
mkdir -p "$OUT/inst" && cd "$OUT/inst"
for i in violin cello contrabass french-horn harp trumpet trombone flute clarinet bassoon tuba xylophone; do
  npm pack -q "tonejs-instrument-$i-mp3" >/dev/null
  mkdir -p "$i" && tar -xzf tonejs-instrument-$i-mp3-*.tgz -C "$i" && rm tonejs-instrument-$i-mp3-*.tgz
done
npm pack -q soundfont-for-samplers >/dev/null
mkdir -p sfs && tar -xzf soundfont-for-samplers-*.tgz -C sfs && rm soundfont-for-samplers-*.tgz
cd "$OUT" && npm pack -q lamejs >/dev/null && mkdir -p lame && tar -xzf lamejs-*.tgz -C lame && rm lamejs-*.tgz
echo "받음: $OUT"

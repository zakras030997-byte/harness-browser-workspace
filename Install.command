#!/bin/zsh
set -eu
cd -- "${0:A:h}"
app="${ANODHAS_HARNESS_APP:-/Applications/DeepSeek Harness.app}"
if [[ ! -f "$app/Contents/MacOS/DeepSeek Harness" ]]; then
  print -u2 'Не найден DeepSeek Harness.app. Установите поддерживаемую версию из официального источника.'
  exit 1
fi
ELECTRON_RUN_AS_NODE=1 "$app/Contents/MacOS/DeepSeek Harness" scripts/install-suite.cjs "$app" "$@"

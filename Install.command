#!/bin/zsh
set -eu
cd -- "${0:A:h}"
app="${ANODHAS_HARNESS_APP:-/Applications/DeepSeek Harness.app}"
if [[ ! -x "$app/Contents/MacOS/DeepSeek Harness" && -z "${ANODHAS_HARNESS_APP:-}" ]]; then
  app="$HOME/Applications/DeepSeek Harness.app"
fi
if [[ ! -x "$app/Contents/MacOS/DeepSeek Harness" ]]; then
  print -u2 'Не найден официальный DeepSeek Harness.app. Установите Harness или задайте ANODHAS_HARNESS_APP.'
  exit 1
fi
ELECTRON_RUN_AS_NODE=1 "$app/Contents/MacOS/DeepSeek Harness" scripts/install-suite.cjs "$app" "$@"

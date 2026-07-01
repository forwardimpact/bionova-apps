#!/usr/bin/env bash
# Download the TEI embedding model (BAAI/bge-small-en-v1.5) to a host directory.
#
# The tei container downloads this model from huggingface.co on first start.
# When a TLS-inspecting proxy sits between the container and the internet, that
# download fails ("certificate verify failed: self-signed certificate in chain")
# because the container does not trust the proxy CA. The host usually does, so
# fetch the model here and point tei at the local copy via .env — see the lines
# this script prints on success.
#
# Idempotent: existing complete files are kept; partial downloads resume.
set -euo pipefail

REPO="BAAI/bge-small-en-v1.5"
BASE="https://huggingface.co/${REPO}/resolve/main"
DEST="${TEI_MODEL_CACHE:-$HOME/.cache/bionova-tei-model/bge-small-en-v1.5}"

# The cpu-1.5 image uses the ONNX backend, so onnx/model.onnx is required; the
# safetensors weights are not downloaded. The rest are config + tokenizer files.
FILES=(
  config.json
  config_sentence_transformers.json
  sentence_bert_config.json
  special_tokens_map.json
  tokenizer.json
  tokenizer_config.json
  vocab.txt
  1_Pooling/config.json
  onnx/model.onnx
)

echo "Fetching ${REPO} into ${DEST}"
mkdir -p "$DEST/1_Pooling" "$DEST/onnx"
for f in "${FILES[@]}"; do
  out="$DEST/$f"
  printf '  %-24s ' "$f"
  # -C - resumes a partial file; a complete file re-downloads only the tail.
  if curl -fL -C - --retry 3 --max-time 600 -sS -o "$out" "$BASE/$f"; then
    echo "ok ($(du -h "$out" | cut -f1))"
  else
    echo "FAILED"
    echo "Could not download $f from $BASE — check network access to huggingface.co" >&2
    exit 1
  fi
done

cat <<EOF

Model ready at:
  $DEST

Add these lines to your .env to make tei load it locally (no container download):
  TEI_MODEL_ID=/data
  TEI_MODEL_SOURCE=$DEST

Then recreate tei:
  docker compose up -d tei
EOF

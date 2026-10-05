#!/usr/bin/env bash
# Renders every ```mermaid block in the docs to PNG (for Devpost, which does not render Mermaid) and SVG.
# Needs Node and a network connection the first time (downloads mermaid-cli and a headless Chromium).
set -euo pipefail
OUT=research/diagrams
mkdir -p "$OUT"
for f in ARCHITECTURE.md research/docs/submission/DEVPOST.md research/docs/submission/DEMO_SCRIPT.md; do
  [ -f "$f" ] || continue
  name=$(basename "$f" .md | tr '[:upper:]' '[:lower:]')
  echo "── $f"
  npx -y @mermaid-js/mermaid-cli@11 -i "$f" -o "$OUT/$name.md" -e png -b white -s 2
  npx -y @mermaid-js/mermaid-cli@11 -i "$f" -o "$OUT/$name-svg.md" -e svg -b transparent
done
echo ""
echo "✓ Diagrams in $OUT/ — upload the PNGs to Devpost's gallery or embed them in the story."

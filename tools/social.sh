#!/bin/sh
# Renderiza tools/share.html con Chrome headless:
#   public/social.png y public/social-en.png (1200×630, Open Graph y Twitter)
#   .local/catalogue/decretometro-lead.png (1000×600 a 2×, portada del catálogo de danielalmazan.com)
# Uso: npm run social
set -e
cd "$(dirname "$0")/.."
CHROME="${CHROME:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"
PAGE="file://$PWD/tools/share.html"
mkdir -p .local/catalogue
shot() { # salida, idioma, ancho, alto, escala
  "$CHROME" --headless=new --disable-gpu --hide-scrollbars --allow-file-access-from-files \
    --force-device-scale-factor="$5" --window-size="$3,$4" --virtual-time-budget=4000 \
    --screenshot="$PWD/$1" "$PAGE?lang=$2" 2>/dev/null
  echo "ok $1"
}
shot public/social.png es 1200 630 1
shot public/social-en.png en 1200 630 1
shot .local/catalogue/decretometro-lead.png es 1000 600 2

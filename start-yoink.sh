#!/usr/bin/env sh
# Starts the yoink! server and opens the game in your browser.
cd "$(dirname "$0")" || exit 1
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is not installed. yoink! needs Node.js 18 or newer: https://nodejs.org"
  exit 1
fi
if [ ! -d node_modules ]; then
  echo "Installing yoink! dependencies, this only happens once..."
  npm install || exit 1
fi
YOINK_OPEN=1 exec npm start

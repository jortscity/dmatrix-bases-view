#!/usr/bin/env bash
# deploy.sh — build and copy plugin files to your local Obsidian vault.
#
# One-time setup: create a file called .vault-path in this directory
# containing the absolute path to your vault, e.g.:
#   echo "/path/to/your/vault" > .vault-path

set -e

PLUGIN_ID="decision-matrix-bases-view"
CONFIG_FILE="$(dirname "$0")/.vault-path"

if [ ! -f "$CONFIG_FILE" ]; then
  echo "ERROR: .vault-path not found."
  echo "Create it with the path to your Obsidian vault, e.g.:"
  echo "  echo \"/path/to/your/vault\" > .vault-path"
  exit 1
fi

VAULT_PATH="$(cat "$CONFIG_FILE" | tr -d '\r\n')"
DEST="$VAULT_PATH/.obsidian/plugins/$PLUGIN_ID"

if [ ! -d "$VAULT_PATH" ]; then
  echo "ERROR: Vault path does not exist: $VAULT_PATH"
  exit 1
fi

echo "Building..."
node esbuild.config.mjs production

mkdir -p "$DEST"
cp main.js       "$DEST/main.js"
cp manifest.json "$DEST/manifest.json"
cp styles.css    "$DEST/styles.css"

echo "Deployed to: $DEST"
echo "Reload the plugin in Obsidian (Settings → Community plugins → toggle off/on)."

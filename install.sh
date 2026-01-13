#!/bin/bash

# Installation script for Obsidian Paperpile Import plugin

echo "🔌 Obsidian Paperpile Import - Installation"
echo "==========================================="
echo ""

# Check if vault path is provided
if [ -z "$1" ]; then
    echo "Usage: ./install.sh /path/to/your/obsidian/vault"
    echo ""
    echo "Example:"
    echo "  ./install.sh ~/Obsidian/MyVault"
    echo ""
    exit 1
fi

VAULT_PATH="$1"
PLUGIN_DIR="$VAULT_PATH/.obsidian/plugins/paperpile-import"

# Check if vault exists
if [ ! -d "$VAULT_PATH" ]; then
    echo "❌ Error: Vault path does not exist: $VAULT_PATH"
    exit 1
fi

# Check if .obsidian folder exists
if [ ! -d "$VAULT_PATH/.obsidian" ]; then
    echo "❌ Error: Not a valid Obsidian vault (no .obsidian folder found)"
    exit 1
fi

# Create plugin directory
echo "📁 Creating plugin directory..."
mkdir -p "$PLUGIN_DIR"

# Copy files
echo "📋 Copying plugin files..."
cp main.js "$PLUGIN_DIR/"
cp manifest.json "$PLUGIN_DIR/"

echo ""
echo "✅ Installation complete!"
echo ""
echo "Next steps:"
echo "1. Open Obsidian"
echo "2. Go to Settings → Community plugins"
echo "3. Click 'Reload' (or restart Obsidian)"
echo "4. Enable 'Paperpile BibTeX Import'"
echo ""
echo "Plugin installed to: $PLUGIN_DIR"

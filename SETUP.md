# Quick Setup Guide

## ✅ Plugin Installed

The plugin has been built and installed to your vault at:
`~/Obsidian/Vault_Research_V4_20251205/.obsidian/plugins/paperpile-import/`

## Next Steps

### 1. Enable the Plugin

1. Open Obsidian
2. Go to Settings → Community plugins
3. Click "Reload" if the plugin doesn't appear
4. Find "Paperpile BibTeX Import" in the list
5. Toggle it ON

### 2. Configure Settings (Optional)

Go to Settings → Paperpile Import to configure:
- **Papers folder**: `Papers` (default, already exists in your vault)
- **Archive file**: `paperpile-archive.json` (will be created automatically)
- **PDF folder**: `PDFs` (default)
- **Paperpile PDF path**: Leave empty or set to your Google Drive Paperpile folder

### 3. Import Your First BibTeX File

1. Open Command Palette (Cmd+P)
2. Type "Import Paperpile BibTeX file"
3. Select a `.bib` file
4. Watch the magic happen! ✨

## How It Works

- Opens a file picker to select any `.bib` file
- Parses all BibTeX entries
- Creates markdown files in your Papers folder
- Organizes by Paperpile folder structure
- Preserves any notes you've added to existing papers
- Tracks changes to avoid unnecessary updates
- Moves removed papers to "Removed Papers" subfolder

## Example Workflow

1. Export BibTeX from Paperpile (or save to Desktop)
2. Run the import command in Obsidian
3. Select the `.bib` file
4. Done! Papers appear in your vault organized by folders

## Comparison to Python Script

| Feature | Python Script | Plugin |
|---------|--------------|--------|
| Location | Terminal | Inside Obsidian |
| File Selection | Copy to folder | File picker dialog |
| Notifications | Console output | Obsidian notices |
| Settings | Edit script | Settings UI |
| Dependencies | Python + packages | None (built-in) |

## Troubleshooting

### Plugin doesn't appear
- Make sure you've reloaded community plugins
- Check that the files exist in `.obsidian/plugins/paperpile-import/`

### Import fails
- Check that the file is valid BibTeX
- Look for errors in Developer Console (Cmd+Option+I)

### Papers not organized into folders
- Make sure your BibTeX keywords include folder paths starting with `_`
- Example: `_Project HDAC/__HDAC10/HDAC10 - Amines`

## Source Code

The plugin source is at: `~/obsidian-paperpile-import/`

To rebuild after changes:
```bash
cd ~/obsidian-paperpile-import
npm run build
cp main.js manifest.json ~/Obsidian/Vault_Research_V4_20251205/.obsidian/plugins/paperpile-import/
```

Then reload Obsidian or restart it.

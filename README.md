# Obsidian Paperpile Import Plugin

Import Paperpile BibTeX files directly into your Obsidian vault with organized markdown files and automatic folder structure.

## Features

- 📂 **Import BibTeX files** via file picker dialog
- 📝 **Creates markdown files** with YAML frontmatter for each paper
- 🏷️ **Automatic tagging** from Paperpile keywords
- 📁 **Folder organization** matching your Paperpile folder structure
- 💾 **Preserves user notes** during updates
- 🔄 **Tracks changes** to avoid unnecessary rewrites
- 🗑️ **Cleanup** - moves removed papers to "Removed Papers" folder
- ⚙️ **Configurable** settings for folders and paths

## Installation

### Development Installation

1. Clone or download this repository
2. Navigate to the plugin directory:
   ```bash
   cd obsidian-paperpile-import
   ```

3. Install dependencies:
   ```bash
   npm install
   ```

4. Build the plugin:
   ```bash
   npm run build
   ```

5. Copy the built files to your vault's plugins folder:
   ```bash
   mkdir -p /path/to/your/vault/.obsidian/plugins/paperpile-import
   cp main.js manifest.json /path/to/your/vault/.obsidian/plugins/paperpile-import/
   ```

6. Enable the plugin in Obsidian:
   - Open Settings → Community plugins
   - Reload plugins
   - Enable "Paperpile BibTeX Import"

### Manual Installation

1. Download `main.js` and `manifest.json` from the releases
2. Create a folder in your vault: `.obsidian/plugins/paperpile-import/`
3. Copy both files to that folder
4. Reload Obsidian and enable the plugin in settings

## Usage

### Import a BibTeX File

1. Open the Command Palette (Cmd/Ctrl + P)
2. Search for "Import Paperpile BibTeX file"
3. Select your `.bib` file from the file picker
4. The plugin will:
   - Parse all entries
   - Create/update markdown files in your Papers folder
   - Organize by Paperpile folders
   - Preserve any notes you've added
   - Show a summary notification

### Settings

Configure the plugin in Settings → Paperpile Import:

- **Papers folder**: Where paper markdown files are stored (default: `Papers`)
- **Archive file**: JSON file to track imported papers (default: `paperpile-archive.json`)
- **PDF folder**: Where PDF files are stored (default: `PDFs`)
- **Paperpile PDF path**: Optional path to Paperpile PDFs on your system

## File Format

Each paper creates a markdown file named `{ref_id}.md` with:

```markdown
---
title: "Paper Title"
authors: "Author One, Author Two"
year: 2024
journal: "Journal Name"
abstract: "Paper abstract..."
url: "https://..."
doi: "10.1234/example"
ref_id: "Author2024-xy"
tags:
  - Project-Folder
  - Topic
type: paper
---

**DOI:** [10.1234/example](https://doi.org/10.1234/example)

## 📓 Notes

<!-- Add your notes here -->
```

## Folder Organization

Papers are automatically organized based on Paperpile folder structure:
- Keywords starting with `_` in BibTeX are treated as Paperpile folders
- Primary (first) folder determines file location
- Example: `_Project HDAC/__HDAC10` creates `Papers/Project HDAC/__HDAC10/`

## How It Works

1. **BibTeX Parsing**: Uses `bibtex-parse` library to read BibTeX entries
2. **Archive Tracking**: Stores processed entries in a JSON file to detect changes
3. **Note Preservation**: Extracts user content after frontmatter during updates
4. **Smart Updates**: Only rewrites files when BibTeX data changes
5. **Cleanup**: Moves papers no longer in BibTeX to "Removed Papers" folder

## Development

### Building

```bash
npm run build      # Production build
npm run dev        # Development mode with watch
```

### Project Structure

- `main.ts` - Main plugin code with BibTeX import logic
- `manifest.json` - Plugin metadata
- `package.json` - Node dependencies
- `tsconfig.json` - TypeScript configuration
- `esbuild.config.mjs` - Build configuration

## Comparison with Python Script

This plugin provides the same functionality as the Python sync script but:
- ✅ Works entirely within Obsidian
- ✅ No terminal or Python required
- ✅ File picker for easy BibTeX selection
- ✅ Visual notifications for import status
- ✅ Configurable via Obsidian settings UI

## License

MIT

## Credits

Based on the Paperpile-Obsidian sync workflow. Ported from Python to TypeScript for native Obsidian integration.

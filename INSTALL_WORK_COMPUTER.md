# Installation Instructions for Work Computer

Quick guide to install the Paperpile Import plugin on your work computer.

## Prerequisites

- Git installed
- Obsidian installed
- An Obsidian vault set up

## Installation Steps

### 1. Clone the Repository

Open Terminal and run:

```bash
git clone https://github.com/djw920/obsidian-paperpile-import.git
cd obsidian-paperpile-import
```

### 2. Run the Install Script

Replace `/path/to/your/vault` with your actual vault location:

```bash
./install.sh /path/to/your/vault
```

**Examples:**
- If vault is in Documents: `./install.sh ~/Documents/MyVault`
- If vault is in iCloud: `./install.sh ~/Library/Mobile\ Documents/iCloud~md~obsidian/Documents/MyVault`

### 3. Enable the Plugin in Obsidian

1. Open Obsidian
2. Go to **Settings** (gear icon)
3. Click **Community plugins** in the left sidebar
4. Click **Reload** (or restart Obsidian)
5. Find **"Paperpile BibTeX Import"** in the list
6. Toggle it **ON**

### 4. Configure Settings (Optional)

Go to **Settings → Paperpile Import** to configure:

- **Papers folder**: `Papers` (default)
- **Archive file**: `paperpile-archive.json` (default)
- **PDF folder**: `PDFs` (default)
- **Paperpile PDF path**: Leave empty unless you have PDFs stored elsewhere

## Using the Plugin

### Import a BibTeX File

1. Press **Cmd+P** (or **Ctrl+P** on Windows) to open Command Palette
2. Type: **"Import Paperpile BibTeX file"**
3. Select your `.bib` file from the file picker
4. Wait for the import to complete
5. Check your Papers folder for the new markdown files

### What Gets Imported

Each paper will be created as a markdown file with:
- YAML frontmatter (title, authors, year, journal, abstract, DOI, etc.)
- Automatic folder organization based on Paperpile folders
- Tags from Paperpile keywords
- DOI link
- PDF link (if PDF exists in your vault)
- Notes section for your annotations

### File Organization

Papers are automatically organized by your Paperpile folder structure:
- Keywords starting with `_` become folder paths
- Example: `_Project HDAC/__HDAC10` → `Papers/Project HDAC/__HDAC10/`

## Troubleshooting

### Plugin doesn't appear after installation

- Make sure you clicked "Reload" in Community plugins settings
- Try restarting Obsidian completely
- Verify files exist: `.obsidian/plugins/paperpile-import/main.js` and `manifest.json`

### Import doesn't work

- Check that your `.bib` file is valid BibTeX format
- Open Developer Console (Cmd+Option+I / Ctrl+Shift+I) to see error messages
- Make sure Papers folder exists in your vault

### Papers not organized into folders

- Check that your BibTeX file has `keywords` field
- Folder keywords must start with `_` in Paperpile
- Example in BibTeX: `keywords = "_Project HDAC/__HDAC10;other tag"`

### Permission denied when running install.sh

Make the script executable:
```bash
chmod +x install.sh
```

## Updating the Plugin

To get the latest version:

```bash
cd obsidian-paperpile-import
git pull
./install.sh /path/to/your/vault
```

Then reload the plugin in Obsidian.

## Manual Installation (Alternative)

If the install script doesn't work:

1. Navigate to your vault's plugins folder:
   ```bash
   cd /path/to/your/vault/.obsidian/plugins
   ```

2. Create plugin directory:
   ```bash
   mkdir -p paperpile-import
   ```

3. Copy files:
   ```bash
   cp ~/obsidian-paperpile-import/main.js paperpile-import/
   cp ~/obsidian-paperpile-import/manifest.json paperpile-import/
   ```

4. Reload Obsidian

## Support

- Repository: https://github.com/djw920/obsidian-paperpile-import
- Report issues: https://github.com/djw920/obsidian-paperpile-import/issues

## Quick Reference

**Command to import**: "Import Paperpile BibTeX file"

**Settings location**: Settings → Paperpile Import

**Default folders**:
- Papers stored in: `Papers/`
- Removed papers moved to: `Papers/Removed Papers/`
- Archive tracking: `paperpile-archive.json` (root of vault)

---

**That's it! You're ready to import your Paperpile references into Obsidian.** 🎉

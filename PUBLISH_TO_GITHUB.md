# Publishing to GitHub

The repository has been initialized locally. Follow these steps to push it to GitHub:

## Option 1: Using GitHub Website (Easiest)

1. Go to https://github.com/new
2. Create a new repository:
   - **Name**: `obsidian-paperpile-import`
   - **Description**: "Import Paperpile BibTeX files into Obsidian"
   - **Visibility**: Public (or Private if preferred)
   - **DO NOT** initialize with README, .gitignore, or license (we already have these)
3. Click "Create repository"
4. Copy the commands GitHub shows under "...or push an existing repository from the command line"
5. Run those commands in this directory

The commands will look like:
```bash
cd ~/obsidian-paperpile-import
git remote add origin https://github.com/YOUR_USERNAME/obsidian-paperpile-import.git
git push -u origin main
```

## Option 2: Using GitHub CLI (if you install it)

```bash
cd ~/obsidian-paperpile-import
gh repo create obsidian-paperpile-import --public --source=. --remote=origin --push
```

## After Publishing

Your repository will be at:
`https://github.com/YOUR_USERNAME/obsidian-paperpile-import`

## Installing on Your Work Computer

Once published, on your work computer:

### Method 1: Build from Source

```bash
# Clone the repository
git clone https://github.com/YOUR_USERNAME/obsidian-paperpile-import.git
cd obsidian-paperpile-import

# Install dependencies
npm install

# Build
npm run build

# Copy to your vault
mkdir -p /path/to/your/vault/.obsidian/plugins/paperpile-import
cp main.js manifest.json /path/to/your/vault/.obsidian/plugins/paperpile-import/
```

### Method 2: Direct Download (No Build Required)

After building once on your home computer:

1. Commit and push the built `main.js` file:
   ```bash
   cd ~/obsidian-paperpile-import
   git add -f main.js  # Force add since it's in .gitignore
   git commit -m "Add built main.js for easy installation"
   git push
   ```

2. On work computer, just download and copy:
   ```bash
   git clone https://github.com/YOUR_USERNAME/obsidian-paperpile-import.git
   mkdir -p /path/to/your/vault/.obsidian/plugins/paperpile-import
   cp obsidian-paperpile-import/main.js obsidian-paperpile-import/manifest.json /path/to/your/vault/.obsidian/plugins/paperpile-import/
   ```

### Method 3: Quick Install Script

I'll create an install script for you...

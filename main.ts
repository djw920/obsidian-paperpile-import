import { App, Notice, Plugin, PluginSettingTab, Setting, TFile, TFolder } from 'obsidian';
import * as bibtexParse from 'bibtex-parse';

interface PaperpileImportSettings {
	papersFolder: string;
	archiveFile: string;
	pdfFolder: string;
	paperpilePdfPath: string;
}

const DEFAULT_SETTINGS: PaperpileImportSettings = {
	papersFolder: 'Papers',
	archiveFile: 'paperpile-archive.json',
	pdfFolder: 'PDFs',
	paperpilePdfPath: ''
}

interface BibEntry {
	title?: string;
	author?: string;
	year?: string;
	journal?: string;
	booktitle?: string;
	abstract?: string;
	url?: string;
	doi?: string;
	file?: string;
	keywords?: string;
	annote?: string;
	ID: string;
	[key: string]: any;
}

interface FormattedEntry {
	title: string;
	authors: string;
	year: string;
	ref_id: string;
	link: string;
	doi: string;
	pdf_file: string;
	abstract: string;
	journal: string;
	booktitle: string;
	pdf_path: string;
	folders: string[];
	tags: string[];
	paperpile_notes: string;
}

interface ArchiveRecord {
	entry: FormattedEntry;
	notes: string;
	/** SHA-1 of the raw bib entry text, used for fast skip on re-import. */
	hash?: string;
	/** Path of the generated markdown file relative to the vault root. */
	path?: string;
}

interface Archive {
	[ref_id: string]: ArchiveRecord;
}

// Yield to the event loop after this many entries to keep the renderer
// responsive and let other indexers (Dataview, Omnisearch, etc.) drain.
const IMPORT_BATCH_SIZE = 25;

// Hard cap on the size of the Paperpile-derived notes section to avoid
// freak entries that ship megabytes of inline HTML and blow up the
// renderer's cppgc heap when the file is rendered/indexed.
const MAX_PAPERPILE_NOTES_BYTES = 100 * 1024;

export default class PaperpileImportPlugin extends Plugin {
	settings: PaperpileImportSettings;

	async onload() {
		await this.loadSettings();

		// Add command to import BibTeX file
		this.addCommand({
			id: 'import-bibtex',
			name: 'Import Paperpile BibTeX file',
			callback: () => this.importBibtex()
		});

		// Add settings tab
		this.addSettingTab(new PaperpileImportSettingTab(this.app, this));
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	async importBibtex() {
		// Create file input element
		const input = document.createElement('input');
		input.type = 'file';
		input.accept = '.bib';
		
		input.onchange = async (e: Event) => {
			const file = (e.target as HTMLInputElement).files?.[0];
			if (!file) return;

			try {
				const text = await file.text();
				await this.processBibtex(text);
				new Notice('BibTeX import completed successfully!');
			} catch (error) {
				console.error('Error importing BibTeX:', error);
				new Notice('Error importing BibTeX file: ' + error.message);
			}
		};

		input.click();
	}

	async processBibtex(bibtext: string) {
		const entries = bibtexParse.parse(bibtext);

		// Load archive
		const archive = await this.loadArchive();

		// Track statistics
		let newCount = 0;
		let updatedCount = 0;
		let skippedCount = 0;
		let errorCount = 0;
		const currentRefIds = new Set<string>();

		let processed = 0;
		for (const entry of entries) {
			processed++;

			// Skip malformed entries with no key. Previously these wrote a
			// hidden "<papersFolder>/.md" file that was overwritten on every
			// run.
			const rawKey = (entry && entry.key) ? String(entry.key).trim() : '';
			if (!rawKey) {
				skippedCount++;
				console.warn('Paperpile import: skipping entry with empty key', entry);
				continue;
			}

			// Cheap pre-check using a SHA-1 of the raw bib text. If unchanged
			// we can skip the expensive format/read/write path entirely.
			const rawText: string = (entry && typeof entry.raw === 'string') ? entry.raw : '';
			const rawHash = rawText ? await this.sha1(rawText) : '';
			currentRefIds.add(rawKey);

			const archived = archive[rawKey];
			if (archived && rawHash && archived.hash === rawHash) {
				// Periodically yield even on the fast path to keep the UI alive
				// for very large bib files.
				if (processed % IMPORT_BATCH_SIZE === 0) await this.yieldToEventLoop();
				continue;
			}

			const formattedEntry = this.formatBibEntry(entry);
			if (!formattedEntry.ref_id) {
				skippedCount++;
				continue;
			}

			if (archived && this.entriesAreEqual(archived, formattedEntry)) {
				// Content equal but hash missing/old -> patch the hash so we
				// stay on the fast path next time.
				if (rawHash && archived.hash !== rawHash) archived.hash = rawHash;
				if (processed % IMPORT_BATCH_SIZE === 0) await this.yieldToEventLoop();
				continue;
			}

			try {
				const { userContent, path } = await this.createOrUpdateFile(
					formattedEntry,
					archived?.notes || ''
				);

				if (archived) {
					updatedCount++;
				} else {
					newCount++;
				}

				archive[rawKey] = {
					entry: formattedEntry,
					notes: userContent,
					hash: rawHash,
					path
				};
			} catch (error) {
				errorCount++;
				console.error(`Paperpile import: error processing ${rawKey}:`, error);
			}

			// Yield to the event loop in batches so cppgc / V8 GC can run
			// and other plugins can process file change events incrementally.
			if (processed % IMPORT_BATCH_SIZE === 0) await this.yieldToEventLoop();
		}

		// Clean up removed papers (cheap O(removed) using cached path).
		const movedCount = await this.cleanupRemovedPapers(currentRefIds, archive);

		// Save archive (compact, no pretty-printing).
		await this.saveArchive(archive);

		const summary = [
			`New: ${newCount}`,
			`Updated: ${updatedCount}`,
			`Removed: ${movedCount}`,
			`Skipped: ${skippedCount}`,
			errorCount ? `Errors: ${errorCount}` : ''
		].filter(Boolean).join(' | ');
		new Notice(`Import complete!\n${summary}`);
	}

	private yieldToEventLoop(): Promise<void> {
		return new Promise(resolve => setTimeout(resolve, 0));
	}

	private async sha1(input: string): Promise<string> {
		try {
			const subtle = (globalThis as any)?.crypto?.subtle;
			if (subtle && typeof subtle.digest === 'function') {
				const buf = new TextEncoder().encode(input);
				const hash = await subtle.digest('SHA-1', buf);
				const bytes = new Uint8Array(hash);
				let hex = '';
				for (let i = 0; i < bytes.length; i++) {
					hex += bytes[i].toString(16).padStart(2, '0');
				}
				return hex;
			}
		} catch (e) {
			console.warn('Paperpile import: subtle.digest unavailable, falling back', e);
		}
		// Tiny non-cryptographic fallback (DJB2). Hash quality doesn't
		// matter -- we only need a stable per-entry fingerprint.
		let h = 5381;
		for (let i = 0; i < input.length; i++) {
			h = ((h << 5) + h) ^ input.charCodeAt(i);
			h = h | 0;
		}
		return 'djb2:' + (h >>> 0).toString(16);
	}

	formatBibEntry(entry: any): FormattedEntry {
		// bibtex-parse returns entries with this structure:
		// { key: "ID", fields: [{name: "title", value: "..."}, ...] }
		const refId = entry.key || '';
		
		// Convert fields array to object
		const fieldsObj: any = {};
		if (entry.fields) {
			for (const field of entry.fields) {
				fieldsObj[field.name] = field.value;
			}
		}
		
		// Clean and format fields
		const title = this.cleanStr(fieldsObj.title || '');
		const authors = this.formatAuthors(fieldsObj.author || '');
		const year = this.cleanStr(String(fieldsObj.year || ''));
		const abstract = this.cleanStr(fieldsObj.abstract || '');
		const journal = this.cleanStr(fieldsObj.journal || '');
		const booktitle = this.cleanStr(fieldsObj.booktitle || '');
		
		// Parse folders and tags
		const { folders, tags } = this.parsePaperpileFolders(fieldsObj.keywords || '');
		
		return {
			title,
			authors,
			year,
			ref_id: refId,
			link: fieldsObj.url || '',
			doi: fieldsObj.doi || '',
			pdf_file: fieldsObj.file || '',
			abstract,
			journal,
			booktitle,
			pdf_path: '', // Could implement PDF finding logic
			folders,
			tags,
			paperpile_notes: fieldsObj.annote || ''
		};
	}

	cleanStr(s: string): string {
		if (!s) return '';
		// Remove braces and clean up
		s = s.replace(/[{}]/g, '');
		// Remove non-alphanumeric except specific characters
		s = s.replace(/[^A-Za-z0-9\s&.,\-;:/?()\"']+/g, '');
		return s.trim().replace(/\s+/g, ' ');
	}

	formatAuthors(authorString: string): string {
		if (!authorString) return '';

		// Normalize whitespace first so wrapped author lists from BibTeX
		// don't escape the " and " splitter.
		authorString = authorString.replace(/\s+/g, ' ').trim();

		// Replace 'and' with semicolon (now safely whitespace-collapsed).
		authorString = authorString.replace(/\s+and\s+/gi, '; ');

		// Split by semicolon
		const authors = authorString.split(';').map(a => a.trim()).filter(Boolean);
		const formatted: string[] = [];

		for (const author of authors) {
			if (author.includes(',')) {
				// Format: "Last, First" -> "First Last"
				const parts = author.split(',').map(p => p.trim()).filter(Boolean);
				if (parts.length >= 2) {
					formatted.push(`${parts[1]} ${parts[0]}`);
				} else if (parts.length === 1) {
					formatted.push(parts[0]);
				}
			} else {
				formatted.push(author);
			}
		}

		return formatted.join(', ');
	}

	/**
	 * Sanitize an arbitrary string for safe inclusion as a YAML scalar.
	 * Collapses internal whitespace (newlines/tabs) and strips control
	 * characters that would break Obsidian's metadata cache parser.
	 */
	sanitizeForYaml(s: string): string {
		if (!s) return '';
		return s
			.replace(/[\u0000-\u001F\u007F]/g, ' ')
			.replace(/\s+/g, ' ')
			.trim();
	}

	parsePaperpileFolders(keywords: string): { folders: string[], tags: string[] } {
		if (!keywords) return { folders: [], tags: [] };
		
		// Unescape BibTeX characters
		keywords = keywords.replace(/\\_/g, '_').replace(/\\&/g, '&').replace(/\\%/g, '%');
		
		const items = keywords.split(';').map(i => i.trim());
		const folders: string[] = [];
		const tags: string[] = [];
		
		for (const item of items) {
			if (!item) continue;
			
			if (item.startsWith('_')) {
				// Paperpile folder
				const folderPath = item.substring(1);
				folders.push(folderPath);
				// Create tag from folder path
				const tag = folderPath.replace(/\//g, '-').replace(/\s/g, '_');
				tags.push(tag);
			} else {
				// Regular keyword
				const tag = item.replace(/\s/g, '_').replace(/\//g, '-');
				if (tag) tags.push(tag);
			}
		}
		
		return { folders, tags };
	}

	async createOrUpdateFile(
		entry: FormattedEntry,
		existingNotes: string
	): Promise<{ userContent: string; path: string }> {
		const papersFolder = this.getPapersFolder();
		const filename = `${entry.ref_id}.md`;

		// Determine target folder
		let targetFolder = papersFolder;
		if (entry.folders.length > 0) {
			const primaryFolder = entry.folders[0];
			targetFolder = `${papersFolder}/${primaryFolder}`;
			await this.ensureFolder(targetFolder);
		}

		const filepath = `${targetFolder}/${filename}`;

		// Check for existing file
		const existingFile = this.app.vault.getAbstractFileByPath(filepath);
		let userNotes = existingNotes;

		if (existingFile instanceof TFile) {
			// Extract user notes from existing file
			userNotes = await this.extractUserNotes(existingFile);
		}

		// Create markdown content
		const content = this.createMarkdownContent(entry, userNotes);

		// Write file
		if (existingFile instanceof TFile) {
			await this.app.vault.modify(existingFile, content);
		} else {
			await this.app.vault.create(filepath, content);
		}

		return { userContent: userNotes, path: filepath };
	}

	async extractUserNotes(file: TFile): Promise<string> {
		const content = await this.app.vault.read(file);
		
		// Extract content after frontmatter
		const match = content.match(/^---\n[\s\S]*?\n---\n\n([\s\S]*)$/);
		if (match && match[1]) {
			const notes = match[1].trim();
			// Don't preserve placeholder
			if (notes === '<!-- Add your notes here -->') {
				return '';
			}
			return notes;
		}
		
		return '';
	}

	createMarkdownContent(entry: FormattedEntry, userNotes: string): string {
		const yaml = (v: string) => this.escapeYaml(this.sanitizeForYaml(v));

		let content = '---\n';
		content += `title: "${yaml(entry.title)}"\n`;

		if (entry.authors) {
			content += `authors: "${yaml(entry.authors)}"\n`;
		}
		if (entry.year) {
			content += `year: ${yaml(entry.year)}\n`;
		}
		if (entry.journal) {
			content += `journal: "${yaml(entry.journal)}"\n`;
		}
		if (entry.booktitle) {
			content += `conference: "${yaml(entry.booktitle)}"\n`;
		}
		if (entry.abstract) {
			content += `abstract: "${yaml(entry.abstract)}"\n`;
		}
		if (entry.link) {
			content += `url: "${yaml(entry.link)}"\n`;
		}
		if (entry.doi) {
			content += `doi: "${yaml(entry.doi)}"\n`;
		}
		if (entry.pdf_path) {
			content += `pdf: "${yaml(entry.pdf_path)}"\n`;
		}

		content += `ref_id: "${yaml(entry.ref_id)}"\n`;
		
		// Add tags
		if (entry.tags.length > 0) {
			content += 'tags:\n';
			for (const tag of entry.tags) {
				content += `  - ${tag}\n`;
			}
		}
		
		content += 'type: paper\n';
		content += '---\n\n';
		
		// Add PDF link if exists
		if (entry.pdf_file) {
			const pdfPath = `${this.settings.pdfFolder}/${entry.pdf_file}`;
			const pdfFile = this.app.vault.getAbstractFileByPath(pdfPath);
			if (pdfFile) {
				content += `**PDF:** [[${pdfPath}]]\n\n`;
			}
		}
		
		// Add DOI link
		if (entry.doi) {
			const doiUrl = entry.doi.startsWith('http') ? entry.doi : `https://doi.org/${entry.doi}`;
			content += `**DOI:** [${entry.doi}](${doiUrl})\n\n`;
		}
		
	// Notes section
	content += '## 📓 Notes\n\n';
	
	// Add Paperpile notes
	if (entry.paperpile_notes) {
		content += '### Paperpile Notes\n\n';
		content += this.formatPaperpileNotes(entry.paperpile_notes);
		content += '\n\n';
	}
		
		// Add user notes or placeholder
		if (userNotes) {
			if (entry.paperpile_notes) {
				content += '### Additional Notes\n\n';
			}
			content += `${userNotes}\n\n`;
		} else {
			if (!entry.paperpile_notes) {
				content += '<!-- Add your notes here -->\n\n';
			}
		}
		
		return content;
	}

	escapeYaml(str: string): string {
		// Escape backslashes first, then double-quotes. Anything that
		// reaches here should already have been whitespace-normalized by
		// sanitizeForYaml(); we still defensively strip control chars.
		return str
			.replace(/\\/g, '\\\\')
			.replace(/"/g, '\\"')
			.replace(/[\u0000-\u001F\u007F]/g, ' ');
	}

	/**
	 * Strip the inline HTML that Paperpile sometimes embeds in the
	 * `annote` field. Without this, a single entry can ship tens of KB
	 * of `<p style="...">` tags which inflate every rendered DOM tree
	 * and contributed to the cppgc OOM that crashed the renderer.
	 */
	private stripHtml(input: string): string {
		if (!input) return '';
		return input
			// Convert common block close tags to newlines so paragraph
			// structure survives the strip.
			.replace(/<\s*br\s*\/?\s*>/gi, '\n')
			.replace(/<\s*\/(p|div|h[1-6]|li|tr|blockquote)\s*>/gi, '\n')
			// Drop everything else.
			.replace(/<[^>]+>/g, '')
			// Common HTML entities.
			.replace(/&nbsp;/gi, ' ')
			.replace(/&amp;/gi, '&')
			.replace(/&lt;/gi, '<')
			.replace(/&gt;/gi, '>')
			.replace(/&quot;/gi, '"')
			.replace(/&#39;/gi, "'")
			// Zero-width / BOM characters Paperpile sometimes injects.
			.replace(/[\u200B-\u200F\uFEFF]/g, '')
			// Collapse runs of more than 2 newlines.
			.replace(/\n{3,}/g, '\n\n');
	}

	formatPaperpileNotes(notes: string): string {
		if (!notes) return '';

		// 1. Strip embedded HTML so we don't write thousands of inline
		//    DOM nodes into the markdown body.
		let cleaned = this.stripHtml(notes);

		// 2. Cap absurdly large notes. Paperpile occasionally exports
		//    huge HTML dumps in `annote`; truncating prevents a single
		//    entry from dominating renderer memory.
		if (cleaned.length > MAX_PAPERPILE_NOTES_BYTES) {
			cleaned = cleaned.slice(0, MAX_PAPERPILE_NOTES_BYTES) +
				`\n\n_… (truncated by Paperpile import; original was ` +
				`${cleaned.length.toLocaleString()} chars)_`;
		}

		// Split into lines and process
		const lines = cleaned.split('\n');
		const formatted: string[] = [];
		let inParagraph = false;

		for (let i = 0; i < lines.length; i++) {
			let line = lines[i].trim();

			// Empty line - preserve as paragraph break
			if (!line) {
				if (inParagraph) {
					formatted.push(''); // Add blank line
					inParagraph = false;
				}
				continue;
			}

			// Check if it's a heading (no quotes, title case, relatively short, not ending with period)
			if (this.isHeadingLine(line)) {
				if (inParagraph) formatted.push(''); // Add space before heading
				formatted.push(`#### ${line}`);
				formatted.push(''); // Add space after heading
				inParagraph = false;
			}
			// Check if it's a quote (starts with ")
			else if (line.startsWith('"')) {
				// It's a quote - format as blockquote
				formatted.push(`> ${line}`);
				inParagraph = false;
			}
			// Already a bullet point
			else if (line.startsWith('-') || line.startsWith('•')) {
				formatted.push(line);
				inParagraph = false;
			}
			// Regular paragraph text
			else {
				formatted.push(line);
				inParagraph = true;
			}
		}

		return formatted.join('\n');
	}

	isHeadingLine(line: string): boolean {
		// Headings are typically:
		// - Title Case (multiple capital letters)
		// - Not starting with a quote
		// - Not ending with a period
		// - Relatively short (< 100 chars)
		// - Have at least 2 capital letters
		
		if (line.startsWith('"')) return false; // Quotes aren't headings
		if (line.endsWith('.') || line.endsWith(',')) return false; // Sentences aren't headings
		if (line.length > 100) return false; // Too long
		
		const capitalCount = (line.match(/[A-Z]/g) || []).length;
		if (capitalCount >= 2 && !line.includes('(')) {
			// Has multiple capitals and no parentheses (citations have parens)
			return true;
		}
		
		return false;
	}

	async ensureFolder(folderPath: string) {
		const folder = this.app.vault.getAbstractFileByPath(folderPath);
		if (!folder) {
			await this.app.vault.createFolder(folderPath);
		}
	}

	getPapersFolder(): string {
		return this.settings.papersFolder;
	}

	entriesAreEqual(archiveEntry: any, bibEntry: FormattedEntry): boolean {
		if (!archiveEntry || !archiveEntry.entry) return false;
		return JSON.stringify(archiveEntry.entry) === JSON.stringify(bibEntry);
	}

	async loadArchive(): Promise<Archive> {
		const archivePath = this.settings.archiveFile;
		const file = this.app.vault.getAbstractFileByPath(archivePath);
		
		if (file instanceof TFile) {
			const content = await this.app.vault.read(file);
			return JSON.parse(content);
		}
		
		return {};
	}

	async saveArchive(archive: Archive) {
		const archivePath = this.settings.archiveFile;
		// Compact serialization: pretty-printing roughly doubles peak
		// memory for large archives and provides no runtime benefit.
		const content = JSON.stringify(archive);

		const file = this.app.vault.getAbstractFileByPath(archivePath);
		if (file instanceof TFile) {
			await this.app.vault.modify(file, content);
		} else {
			await this.app.vault.create(archivePath, content);
		}
	}

	async cleanupRemovedPapers(currentRefIds: Set<string>, archive: Archive): Promise<number> {
		const papersFolder = this.getPapersFolder();
		const removedFolder = `${papersFolder}/Removed Papers`;

		let movedCount = 0;
		let ensuredRemovedFolder = false;

		for (const refId in archive) {
			if (currentRefIds.has(refId)) continue;

			const record = archive[refId];
			let file: TFile | null = null;

			// Fast path: the archive remembers the original path of the
			// generated file, so we can resolve it directly instead of
			// recursively scanning the entire Papers tree.
			if (record?.path) {
				const maybe = this.app.vault.getAbstractFileByPath(record.path);
				if (maybe instanceof TFile) file = maybe;
			}

			// Fallback for archive entries written by older versions of
			// the plugin that didn't store a path.
			if (!file) {
				const filename = `${refId}.md`;
				const folder = this.app.vault.getAbstractFileByPath(papersFolder);
				if (folder instanceof TFolder) {
					file = this.findFileRecursive(folder, filename);
				}
			}

			if (file && file.parent?.path !== removedFolder) {
				if (!ensuredRemovedFolder) {
					await this.ensureFolder(removedFolder);
					ensuredRemovedFolder = true;
				}
				try {
					const newPath = `${removedFolder}/${file.name}`;
					await this.app.fileManager.renameFile(file, newPath);
					movedCount++;
				} catch (e) {
					console.error(`Paperpile import: failed to move ${refId}:`, e);
				}
			}

			delete archive[refId];
		}

		return movedCount;
	}

	findFileRecursive(folder: TFolder, filename: string): TFile | null {
		for (const child of folder.children) {
			if (child instanceof TFile && child.name === filename) {
				return child;
			} else if (child instanceof TFolder) {
				const found = this.findFileRecursive(child, filename);
				if (found) return found;
			}
		}
		return null;
	}
}

class PaperpileImportSettingTab extends PluginSettingTab {
	plugin: PaperpileImportPlugin;

	constructor(app: App, plugin: PaperpileImportPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		containerEl.createEl('h2', { text: 'Paperpile Import Settings' });

		new Setting(containerEl)
			.setName('Papers folder')
			.setDesc('Folder in your vault where papers will be stored')
			.addText(text => text
				.setPlaceholder('Papers')
				.setValue(this.plugin.settings.papersFolder)
				.onChange(async (value) => {
					this.plugin.settings.papersFolder = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Archive file')
			.setDesc('JSON file to track imported papers')
			.addText(text => text
				.setPlaceholder('paperpile-archive.json')
				.setValue(this.plugin.settings.archiveFile)
				.onChange(async (value) => {
					this.plugin.settings.archiveFile = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('PDF folder')
			.setDesc('Folder where PDF files are stored')
			.addText(text => text
				.setPlaceholder('PDFs')
				.setValue(this.plugin.settings.pdfFolder)
				.onChange(async (value) => {
					this.plugin.settings.pdfFolder = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Paperpile PDF path')
			.setDesc('Path to Paperpile PDFs on your system (optional)')
			.addText(text => text
				.setPlaceholder('/path/to/paperpile/pdfs')
				.setValue(this.plugin.settings.paperpilePdfPath)
				.onChange(async (value) => {
					this.plugin.settings.paperpilePdfPath = value;
					await this.plugin.saveSettings();
				}));
	}
}

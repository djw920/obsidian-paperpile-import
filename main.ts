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

interface Archive {
	[ref_id: string]: {
		entry: FormattedEntry;
		notes: string;
	};
}

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
		const currentRefIds = new Set<string>();

		// Process each entry
		for (const entry of entries) {
			const formattedEntry = this.formatBibEntry(entry);
			const refId = formattedEntry.ref_id;
			currentRefIds.add(refId);

			// Check if entry has changed
			if (archive[refId] && this.entriesAreEqual(archive[refId], formattedEntry)) {
				continue; // No changes
			}

			// Create or update file
			try {
				const userContent = await this.createOrUpdateFile(formattedEntry, archive[refId]?.notes || '');
				
				if (archive[refId]) {
					updatedCount++;
				} else {
					newCount++;
				}

				archive[refId] = {
					entry: formattedEntry,
					notes: userContent
				};
			} catch (error) {
				console.error(`Error processing ${refId}:`, error);
			}
		}

		// Clean up removed papers
		const movedCount = await this.cleanupRemovedPapers(currentRefIds, archive);

		// Save archive
		await this.saveArchive(archive);

		// Show summary
		new Notice(`Import complete!\nNew: ${newCount} | Updated: ${updatedCount} | Removed: ${movedCount}`);
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
		s = s.replace(/[^A-Za-z0-9\s&.,-;:/?()\"']+/g, '');
		return s.trim().replace(/\s+/g, ' ');
	}

	formatAuthors(authorString: string): string {
		if (!authorString) return '';
		
		// Replace 'and' with semicolon
		authorString = authorString.replace(/ and /gi, '; ');
		
		// Split by semicolon
		const authors = authorString.split(';').map(a => a.trim());
		const formatted: string[] = [];
		
		for (const author of authors) {
			if (author.includes(',')) {
				// Format: "Last, First" -> "First Last"
				const parts = author.split(',').map(p => p.trim());
				if (parts.length >= 2) {
					formatted.push(`${parts[1]} ${parts[0]}`);
				} else {
					formatted.push(author);
				}
			} else {
				formatted.push(author);
			}
		}
		
		return formatted.join(', ');
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

	async createOrUpdateFile(entry: FormattedEntry, existingNotes: string): Promise<string> {
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
		
		return userNotes;
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
		let content = '---\n';
		content += `title: "${this.escapeYaml(entry.title)}"\n`;
		
		if (entry.authors) {
			content += `authors: "${this.escapeYaml(entry.authors)}"\n`;
		}
		if (entry.year) {
			content += `year: ${entry.year}\n`;
		}
		if (entry.journal) {
			content += `journal: "${this.escapeYaml(entry.journal)}"\n`;
		}
		if (entry.booktitle) {
			content += `conference: "${this.escapeYaml(entry.booktitle)}"\n`;
		}
		if (entry.abstract) {
			content += `abstract: "${this.escapeYaml(entry.abstract)}"\n`;
		}
		if (entry.link) {
			content += `url: "${entry.link}"\n`;
		}
		if (entry.doi) {
			content += `doi: "${entry.doi}"\n`;
		}
		if (entry.pdf_path) {
			content += `pdf: "${entry.pdf_path}"\n`;
		}
		
		content += `ref_id: "${entry.ref_id}"\n`;
		
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
			content += `${entry.paperpile_notes}\n\n`;
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
		return str.replace(/"/g, '\\"');
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
		const content = JSON.stringify(archive, null, 2);
		
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
		await this.ensureFolder(removedFolder);
		
		let movedCount = 0;
		
		for (const refId in archive) {
			if (!currentRefIds.has(refId)) {
				// Find and move the file
				const filename = `${refId}.md`;
				const folder = this.app.vault.getAbstractFileByPath(papersFolder);
				
				if (folder instanceof TFolder) {
					// Search for file recursively
					const file = this.findFileRecursive(folder, filename);
					if (file && file.parent?.path !== removedFolder) {
						const newPath = `${removedFolder}/${file.name}`;
						await this.app.fileManager.renameFile(file, newPath);
						movedCount++;
					}
				}
				
				delete archive[refId];
			}
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

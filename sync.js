import 'dotenv/config';
import { Client } from '@notionhq/client';
import fs from 'fs/promises';
import path from 'path';
import {
  VAULT_DIR,
  FOLDER_MAP,
  MANAGED_FOLDERS,
  MANAGED_ROOT_FILES,
  LEGACY_FOLDERS,
  SETTINGS,
} from './config.js';

// ---------------------------------------------------------------------------
// Notion client
// ---------------------------------------------------------------------------

const notion = new Client({ auth: process.env.NOTION_API_KEY });

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// Phase 1 – Discover databases inside the Work Hub page
// ---------------------------------------------------------------------------

async function discoverDatabases(workHubPageId) {
  console.log('\n[1/6] Discovering databases in Work Hub...');
  const databases = new Map(); // folderName → dbId

  let cursor;
  do {
    const res = await notion.blocks.children.list({
      block_id: workHubPageId,
      page_size: 100,
      ...(cursor ? { start_cursor: cursor } : {}),
    });
    await sleep(SETTINGS.apiDelayMs);

    for (const block of res.results) {
      if (block.type !== 'child_database') continue;
      const title = block.child_database?.title ?? '';
      const folder = FOLDER_MAP[title];
      if (folder) {
        databases.set(folder, block.id);
        console.log(`  Found: "${title}" → ${folder}/ (${block.id})`);
      }
    }

    cursor = res.has_more ? res.next_cursor : null;
  } while (cursor);

  const missing = Object.values(FOLDER_MAP).filter(f => !databases.has(f));
  if (missing.length) {
    console.warn(`  Warning: could not find databases for: ${missing.join(', ')}`);
  }

  return databases; // Map<folderName, dbId>
}

// ---------------------------------------------------------------------------
// Phase 2 – Fetch all pages from a database (with pagination)
// ---------------------------------------------------------------------------

async function fetchAllPages(dbId) {
  const pages = [];
  let cursor;

  do {
    const res = await notion.databases.query({
      database_id: dbId,
      page_size: 100,
      ...(cursor ? { start_cursor: cursor } : {}),
    });
    await sleep(SETTINGS.apiDelayMs);
    pages.push(...res.results);
    cursor = res.has_more ? res.next_cursor : null;
  } while (cursor);

  return pages;
}

// ---------------------------------------------------------------------------
// Phase 3a – Convert Notion property values to plain scalars for YAML
// ---------------------------------------------------------------------------

function richTextToPlain(richText) {
  if (!Array.isArray(richText)) return '';
  return richText.map(t => t.plain_text ?? '').join('');
}

function propertyToYaml(prop) {
  if (!prop) return null;

  switch (prop.type) {
    case 'title':
      return richTextToPlain(prop.title);

    case 'rich_text':
      return richTextToPlain(prop.rich_text);

    case 'select':
      return prop.select?.name ?? null;

    case 'multi_select':
      return prop.multi_select.map(s => s.name);

    case 'status':
      return prop.status?.name ?? null;

    case 'date':
      if (!prop.date) return null;
      return prop.date.end
        ? `${prop.date.start} → ${prop.date.end}`
        : prop.date.start;

    case 'checkbox':
      return prop.checkbox;

    case 'number':
      return prop.number;

    case 'url':
      return prop.url ?? null;

    case 'email':
      return prop.email ?? null;

    case 'phone_number':
      return prop.phone_number ?? null;

    case 'people':
      return prop.people.map(p => p.name ?? p.id);

    case 'relation':
      return prop.relation.map(r => r.id);

    case 'formula':
      return formulaValue(prop.formula);

    case 'rollup':
      return rollupValue(prop.rollup);

    case 'files':
      return prop.files.map(f => f.name ?? (f.file?.url ?? f.external?.url ?? ''));

    case 'created_time':
      return prop.created_time;

    case 'last_edited_time':
      return prop.last_edited_time;

    case 'created_by':
      return prop.created_by?.name ?? prop.created_by?.id ?? null;

    case 'last_edited_by':
      return prop.last_edited_by?.name ?? prop.last_edited_by?.id ?? null;

    case 'unique_id':
      return prop.unique_id?.prefix
        ? `${prop.unique_id.prefix}-${prop.unique_id.number}`
        : String(prop.unique_id?.number ?? '');

    default:
      return null;
  }
}

function formulaValue(formula) {
  if (!formula) return null;
  switch (formula.type) {
    case 'string':  return formula.string;
    case 'number':  return formula.number;
    case 'boolean': return formula.boolean;
    case 'date':    return formula.date?.start ?? null;
    default:        return null;
  }
}

function rollupValue(rollup) {
  if (!rollup) return null;
  switch (rollup.type) {
    case 'number': return rollup.number;
    case 'date':   return rollup.date?.start ?? null;
    case 'array':  return rollup.array.map(item => propertyToYaml(item));
    default:       return null;
  }
}

// Collect all tags from select / multi_select properties
function extractTags(properties) {
  const tags = new Set();
  for (const prop of Object.values(properties)) {
    if (prop.type === 'select' && prop.select?.name) tags.add(prop.select.name);
    if (prop.type === 'multi_select') prop.multi_select.forEach(s => tags.add(s.name));
    if (prop.type === 'status' && prop.status?.name) tags.add(prop.status.name);
  }
  return [...tags];
}

// ---------------------------------------------------------------------------
// Phase 3b – Convert Notion blocks to Markdown
// ---------------------------------------------------------------------------

async function fetchBlockChildren(blockId) {
  const blocks = [];
  let cursor;
  do {
    const res = await notion.blocks.children.list({
      block_id: blockId,
      page_size: 100,
      ...(cursor ? { start_cursor: cursor } : {}),
    });
    await sleep(SETTINGS.apiDelayMs);
    blocks.push(...res.results);
    cursor = res.has_more ? res.next_cursor : null;
  } while (cursor);
  return blocks;
}

function inlineRichText(richText) {
  if (!Array.isArray(richText)) return '';
  return richText.map(t => {
    let text = t.plain_text ?? '';
    if (t.annotations?.code)          text = '`' + text + '`';
    if (t.annotations?.bold)          text = '**' + text + '**';
    if (t.annotations?.italic)        text = '_' + text + '_';
    if (t.annotations?.strikethrough) text = '~~' + text + '~~';
    if (t.href)                        text = `[${text}](${t.href})`;
    return text;
  }).join('');
}

async function blocksToMarkdown(blocks, indent = '') {
  const lines = [];
  let orderedIndex = 1;

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    const type = block.type;
    const data = block[type] ?? {};

    // Track ordered list numbering resets
    if (type !== 'numbered_list_item') orderedIndex = 1;

    switch (type) {
      case 'paragraph':
        lines.push(indent + inlineRichText(data.rich_text));
        lines.push('');
        break;

      case 'heading_1':
        lines.push(indent + '# ' + inlineRichText(data.rich_text));
        lines.push('');
        break;

      case 'heading_2':
        lines.push(indent + '## ' + inlineRichText(data.rich_text));
        lines.push('');
        break;

      case 'heading_3':
        lines.push(indent + '### ' + inlineRichText(data.rich_text));
        lines.push('');
        break;

      case 'bulleted_list_item': {
        lines.push(indent + '- ' + inlineRichText(data.rich_text));
        if (block.has_children) {
          const children = await fetchBlockChildren(block.id);
          lines.push(await blocksToMarkdown(children, indent + '  '));
        }
        break;
      }

      case 'numbered_list_item': {
        lines.push(indent + `${orderedIndex}. ` + inlineRichText(data.rich_text));
        orderedIndex++;
        if (block.has_children) {
          const children = await fetchBlockChildren(block.id);
          lines.push(await blocksToMarkdown(children, indent + '   '));
        }
        break;
      }

      case 'to_do': {
        const check = data.checked ? '[x]' : '[ ]';
        lines.push(indent + `- ${check} ` + inlineRichText(data.rich_text));
        if (block.has_children) {
          const children = await fetchBlockChildren(block.id);
          lines.push(await blocksToMarkdown(children, indent + '  '));
        }
        break;
      }

      case 'toggle': {
        lines.push(indent + '> ' + inlineRichText(data.rich_text));
        if (block.has_children) {
          const children = await fetchBlockChildren(block.id);
          lines.push(await blocksToMarkdown(children, indent + '> '));
        }
        lines.push('');
        break;
      }

      case 'code':
        lines.push(indent + '```' + (data.language ?? ''));
        lines.push(richTextToPlain(data.rich_text));
        lines.push(indent + '```');
        lines.push('');
        break;

      case 'quote':
        lines.push(indent + '> ' + inlineRichText(data.rich_text));
        lines.push('');
        break;

      case 'callout': {
        const icon = data.icon?.emoji ?? data.icon?.external?.url ?? '';
        lines.push(indent + `> ${icon} ${inlineRichText(data.rich_text)}`);
        lines.push('');
        break;
      }

      case 'divider':
        lines.push(indent + '---');
        lines.push('');
        break;

      case 'image': {
        const url = data.type === 'external' ? data.external?.url : data.file?.url;
        const caption = data.caption ? inlineRichText(data.caption) : '';
        lines.push(indent + `![${caption}](${url ?? ''})`);
        lines.push('');
        break;
      }

      case 'embed':
      case 'bookmark':
        if (data.url) {
          lines.push(indent + `[${data.url}](${data.url})`);
          lines.push('');
        }
        break;

      case 'table': {
        if (block.has_children) {
          const rows = await fetchBlockChildren(block.id);
          const mdRows = rows.map(row => {
            const cells = (row.table_row?.cells ?? []).map(cell => inlineRichText(cell));
            return '| ' + cells.join(' | ') + ' |';
          });
          if (mdRows.length > 0) {
            lines.push(mdRows[0]);
            const sep = '| ' + (row => row.split('|').slice(1, -1).map(() => '---').join(' | ') + ' |')(mdRows[0]);
            lines.push(sep);
            mdRows.slice(1).forEach(r => lines.push(r));
          }
          lines.push('');
        }
        break;
      }

      case 'column_list': {
        if (block.has_children) {
          const columns = await fetchBlockChildren(block.id);
          for (const col of columns) {
            if (col.has_children) {
              const colBlocks = await fetchBlockChildren(col.id);
              lines.push(await blocksToMarkdown(colBlocks, indent));
            }
          }
        }
        break;
      }

      case 'child_page':
        lines.push(indent + `> 📄 Sub-page: ${data.title}`);
        lines.push('');
        break;

      case 'unsupported':
        break;

      default:
        if (data.rich_text) {
          lines.push(indent + inlineRichText(data.rich_text));
          lines.push('');
        }
        break;
    }
  }

  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

// ---------------------------------------------------------------------------
// Phase 3c – Build a note object from a Notion page
// ---------------------------------------------------------------------------

function slugify(text) {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    || 'untitled';
}

function getPageTitle(properties) {
  for (const prop of Object.values(properties)) {
    if (prop.type === 'title') return richTextToPlain(prop.title) || 'Untitled';
  }
  return 'Untitled';
}

function buildRagSummary(title, category) {
  const folderLabel = category.replace(/-/g, ' ');
  return `This note represents the ${folderLabel} entry titled "${title}" synced from Notion. It contains all associated properties and content for use as RAG context.`;
}

function scalarToYaml(value) {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'boolean') return String(value);
  if (typeof value === 'number') return String(value);
  if (Array.isArray(value)) {
    if (value.length === 0) return '[]';
    return '\n' + value.map(v => `  - ${JSON.stringify(v)}`).join('\n');
  }
  // Escape strings that could break YAML
  const s = String(value);
  if (s.includes('\n') || s.includes('"') || s.includes("'") || s.includes(':') || s.startsWith('>') || s.startsWith('|')) {
    return JSON.stringify(s);
  }
  return s;
}

function buildFrontmatter(page, folderName, extraProps) {
  const lines = ['---'];

  // Always-present fields first
  lines.push(`notion_id: ${page.id}`);
  lines.push(`category: ${folderName}`);

  // All Notion properties
  for (const [name, prop] of Object.entries(page.properties)) {
    const key = name.toLowerCase().replace(/\s+/g, '_').replace(/[^\w]/g, '');
    const value = propertyToYaml(prop);
    if (value !== null && value !== undefined) {
      lines.push(`${key}: ${scalarToYaml(value)}`);
    }
  }

  // Tags aggregated from select/multi_select
  const tags = extractTags(page.properties);
  if (tags.length) {
    lines.push(`tags: ${scalarToYaml(tags)}`);
  }

  // Extra props (e.g. resolved relation titles)
  for (const [k, v] of Object.entries(extraProps ?? {})) {
    lines.push(`${k}: ${scalarToYaml(v)}`);
  }

  lines.push(`synced_at: ${new Date().toISOString()}`);
  lines.push('---');
  return lines.join('\n');
}

async function buildNote(page, folderName) {
  const title = getPageTitle(page.properties);
  const slug = slugify(title);
  const ragSummary = buildRagSummary(title, folderName);
  const frontmatter = buildFrontmatter(page, folderName, {});

  let bodyContent = '';
  try {
    const blocks = await fetchBlockChildren(page.id);
    if (blocks.length > 0) {
      bodyContent = await blocksToMarkdown(blocks);
    }
  } catch (err) {
    console.warn(`    Warning: could not fetch blocks for "${title}": ${err.message}`);
  }

  const body = `${ragSummary}\n\n${bodyContent}`.trim();

  return {
    title,
    slug,
    folder: folderName,
    filePath: path.join(VAULT_DIR, folderName, `${slug}.md`),
    frontmatter,
    body,
    notionId: page.id,
    tags: extractTags(page.properties),
  };
}

// ---------------------------------------------------------------------------
// Phase 4 – Write note files
// ---------------------------------------------------------------------------

async function writeNote(note) {
  await fs.mkdir(path.join(VAULT_DIR, note.folder), { recursive: true });
  const content = `${note.frontmatter}\n\n${note.body}\n`;
  await fs.writeFile(note.filePath, content, 'utf8');
}

// ---------------------------------------------------------------------------
// Phase 5 – Cross-link wikilink injection (post-processing pass)
// ---------------------------------------------------------------------------

function buildLinkPattern(title) {
  const escaped = title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // Match whole word, not already inside [[ ]]
  return new RegExp(`(?<!\\[\\[)(?<![\\w/])\\b(${escaped})\\b(?!\\]\\])`, 'gi');
}

function splitFrontmatterBody(fileContent) {
  const match = fileContent.match(/^---\n[\s\S]*?\n---\n([\s\S]*)$/);
  if (!match) return { header: '', body: fileContent };
  const headerEnd = fileContent.indexOf('---\n', 4) + 4;
  return {
    header: fileContent.slice(0, headerEnd),
    body: fileContent.slice(headerEnd),
  };
}

async function injectWikilinks(notes) {
  console.log('\n[5/6] Injecting cross-category wikilinks...');

  // Build lookup: notionId → note (for relation resolution)
  const byId = new Map(notes.map(n => [n.notionId, n]));

  // Build title index sorted by title length desc (longer titles matched first)
  const titleIndex = notes
    .filter(n => n.title.length >= SETTINGS.minLinkTitleLength)
    .sort((a, b) => b.title.length - a.title.length);

  let totalLinks = 0;

  for (const note of notes) {
    const raw = await fs.readFile(note.filePath, 'utf8');
    const { header, body: rawBody } = splitFrontmatterBody(raw);

    let body = rawBody;

    // 1. Title-match cross-links
    for (const target of titleIndex) {
      if (target.notionId === note.notionId) continue; // skip self
      const wikilink = `[[${target.folder}/${target.slug}|${target.title}]]`;
      const pattern = buildLinkPattern(target.title);
      const before = body;
      body = body.replace(pattern, wikilink);
      if (body !== before) totalLinks++;
    }

    // 2. Shared-tag "Related" section
    const sharedTagNotes = notes.filter(
      n => n.notionId !== note.notionId &&
           n.tags.some(t => note.tags.includes(t))
    );
    if (sharedTagNotes.length > 0) {
      const relatedLinks = sharedTagNotes
        .map(n => `- [[${n.folder}/${n.slug}|${n.title}]]`)
        .join('\n');
      if (!body.includes('## Related')) {
        body = body.trimEnd() + `\n\n## Related\n\n${relatedLinks}\n`;
      }
    }

    await fs.writeFile(note.filePath, header + body, 'utf8');
  }

  console.log(`  Injected ${totalLinks} cross-links across ${notes.length} notes.`);
}

// ---------------------------------------------------------------------------
// Phase 6 – Write index.md
// ---------------------------------------------------------------------------

async function writeIndex(notes, allFolders) {
  console.log('\n[6/6] Writing index.md...');
  const now = new Date().toISOString();

  const frontmatter = [
    '---',
    'notion_id: index',
    'category: index',
    `synced_at: ${now}`,
    '---',
  ].join('\n');

  const ragSummary = 'Master index of all Notion Work Hub entries synced to this vault. Every database category and its notes are listed below.';

  const sections = [];
  for (const folder of allFolders) {
    const folderNotes = notes.filter(n => n.folder === folder);
    if (folderNotes.length === 0) continue;
    const label = folder.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    const links = folderNotes
      .sort((a, b) => a.title.localeCompare(b.title))
      .map(n => `- [[${n.folder}/${n.slug}|${n.title}]]`)
      .join('\n');
    sections.push(`## ${label}\n\n${links}`);
  }

  const body = `${ragSummary}\n\n${sections.join('\n\n')}\n`;
  const content = `${frontmatter}\n\n${body}`;

  await fs.writeFile(path.join(VAULT_DIR, 'index.md'), content, 'utf8');
  console.log('  index.md written.');
}

// ---------------------------------------------------------------------------
// Cleanup – remove old content before writing fresh output
// ---------------------------------------------------------------------------

async function cleanVault() {
  console.log('\n[0/6] Cleaning existing vault content...');

  const toRemove = [...LEGACY_FOLDERS, ...MANAGED_FOLDERS];
  for (const dir of toRemove) {
    const full = path.join(VAULT_DIR, dir);
    try {
      await fs.rm(full, { recursive: true, force: true });
      console.log(`  Removed: ${dir}/`);
    } catch {
      // Directory didn't exist — fine
    }
  }

  for (const file of MANAGED_ROOT_FILES) {
    const full = path.join(VAULT_DIR, file);
    try {
      await fs.rm(full, { force: true });
    } catch {
      // File didn't exist — fine
    }
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  if (!process.env.NOTION_API_KEY) {
    console.error('Error: NOTION_API_KEY is not set. Copy .env.example to .env and fill it in.');
    process.exit(1);
  }
  if (!process.env.NOTION_WORK_HUB_PAGE_ID) {
    console.error('Error: NOTION_WORK_HUB_PAGE_ID is not set. Copy .env.example to .env and fill it in.');
    process.exit(1);
  }

  const workHubId = process.env.NOTION_WORK_HUB_PAGE_ID;
  const startTime = Date.now();

  console.log('=== Notion → Obsidian Sync ===');

  await cleanVault();

  // Phase 1: discover
  const databases = await discoverDatabases(workHubId);

  // Phase 2 + 3 + 4: fetch, convert, write
  console.log('\n[2-4/6] Fetching entries, converting, and writing notes...');
  const allNotes = [];

  for (const [folder, dbId] of databases) {
    console.log(`\n  Database: ${folder}`);
    const pages = await fetchAllPages(dbId);
    console.log(`    ${pages.length} entries found.`);

    for (const page of pages) {
      const note = await buildNote(page, folder);
      await writeNote(note);
      allNotes.push(note);
      process.stdout.write('.');
    }
    console.log(` done.`);
  }

  console.log(`\n  Total notes written: ${allNotes.length}`);

  // Phase 5: wikilinks
  await injectWikilinks(allNotes);

  // Phase 6: index
  await writeIndex(allNotes, Object.values(FOLDER_MAP));

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\n=== Sync complete in ${elapsed}s. Vault ready at: ${VAULT_DIR} ===\n`);
}

main().catch(err => {
  console.error('\nFatal error:', err);
  process.exit(1);
});

# Notion → Obsidian Sync

Syncs Nick's Notion Work Hub databases to this repository as Markdown files. The output is an Obsidian-compatible vault with wikilinks for graph view and self-contained notes for LLM RAG use.

## Setup

### 1. Create a Notion integration

1. Go to <https://www.notion.so/my-integrations>
2. Click **New integration**, give it a name (e.g. "Obsidian Sync"), select your workspace
3. Copy the **Internal Integration Token** — this is your `NOTION_API_KEY`

### 2. Share your Work Hub page with the integration

1. Open the **Work Hub** page in Notion
2. Click **Share** (top right) → **Invite** → select your integration
3. The integration needs **Read content** access

### 3. Get your Work Hub page ID

Your Work Hub URL looks like:
```
https://www.notion.so/MyWorkspace/Work-Hub-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```
The 32-character hex string at the end is your `NOTION_WORK_HUB_PAGE_ID`.

### 4. Configure environment

```bash
cp .env.example .env
# Edit .env and fill in NOTION_API_KEY and NOTION_WORK_HUB_PAGE_ID
```

### 5. Install dependencies

```bash
npm install
```

### 6. Run the sync

```bash
node sync.js
# or: npm run sync
```

The script logs each phase to the console. A full sync typically takes 30–120 seconds depending on how many entries your databases contain.

---

## Vault structure

After a successful sync, the repository root becomes an Obsidian vault:

```
index.md              ← hub note linking to every other note
assignments/          ← Assignments database entries
side-quests/          ← Side Quests database entries
coding-projects/      ← Coding Projects database entries
cas-activities/       ← CAS Activities database entries
ee-progress/          ← EE Progress Tracker entries
modern-greek/         ← Modern Greek Portfolio entries
backlog/              ← Backlog Items entries
```

Each `.md` file contains:
- **YAML frontmatter** — every Notion property, `notion_id`, `category`, `tags`, `synced_at`
- **RAG summary** — 1–2 sentence description at the top of the body
- **Body content** — Notion blocks converted to Markdown
- **Wikilinks** — automatically injected where note titles appear in other notes, plus a `## Related` section for shared tags

The previous manual vault content (`tier1/`, `tier2/`, `tier3/`, `support/`) is removed on each sync run. Notion is the single source of truth.

---

## Opening in Obsidian

1. In Obsidian, choose **Open folder as vault**
2. Select this repository's root directory
3. Open **Graph View** (Ctrl/Cmd + G) — you should see nodes connected by wikilinks
4. The `index.md` note is the central hub; every other note links back through it

---

## Re-running / keeping in sync

The script is fully re-runnable — each run wipes and rewrites all content. Run it whenever you want to pull the latest changes from Notion:

```bash
node sync.js
```

---

## Configuration

Edit `config.js` to:
- Change the output folder names (`FOLDER_MAP`)
- Adjust the minimum title length for wikilink injection (`SETTINGS.minLinkTitleLength`)
- Tune the API rate-limit delay (`SETTINGS.apiDelayMs`)

---

## LLM / RAG usage

Point your LLM agent at this directory as a file-based knowledge source. Each note is self-contained: the RAG summary at the top gives the agent immediate context without reading the full file. The `index.md` lists every note — use it as the entry point for retrieval.

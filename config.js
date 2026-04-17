import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Root of the repository — all Notion content is written here directly.
// On each sync run, existing category folders and index.md are wiped and recreated.
export const VAULT_DIR = __dirname;

// Maps the Notion database title (as it appears in the Work Hub page) to the
// output subfolder name inside VAULT_DIR.
export const FOLDER_MAP = {
  'Assignments':             'assignments',
  'Side Quests':             'side-quests',
  'Coding Projects':         'coding-projects',
  'CAS Activities':          'cas-activities',
  'EE Progress Tracker':     'ee-progress',
  'Modern Greek Portfolio':  'modern-greek',
  'Backlog Items':           'backlog',
};

// Folders managed by the sync script — wiped and recreated on each run.
// Non-listed folders (e.g. node_modules) are never touched.
export const MANAGED_FOLDERS = Object.values(FOLDER_MAP);

// Files at vault root that the sync script creates/overwrites.
export const MANAGED_ROOT_FILES = ['index.md'];

// Legacy folders from the old manual vault that should be removed on sync.
export const LEGACY_FOLDERS = ['tier1', 'tier2', 'tier3', 'support'];

// Misc settings
export const SETTINGS = {
  // Minimum title length to qualify for auto wikilink injection
  minLinkTitleLength: 3,
  // Delay in ms between Notion API requests to stay under rate limits (~3 req/s)
  apiDelayMs: 350,
};

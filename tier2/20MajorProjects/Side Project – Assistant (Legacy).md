---
id: side-project-assistant-legacy
category: project-hub
subject: null
level: tier2
created: 2026-04-15T12:00:00Z
updated: 2026-04-15T12:00:00Z
---

# Side Project – Assistant (Legacy)

JARVIS AI Assistant — personal AI assistant integrating Notion + Google Workspace. CAS Creativity activity (30h, completed Mar 2026).

GitHub: https://github.com/nitrimandylis/J.A.R.V.I.S.

## Overview

AI-powered personal assistant built with TypeScript + Bun. Automates: assignment tracking, CAS logging, Modern Greek portfolio, competition tracking, calendar management, email triage. CLI tools interact with Notion API + Google Workspace. Integrates with Claude Code for advanced reasoning.

## Architecture

- Suite of small, single-purpose TypeScript CLI scripts
- Each script accepts arguments, does one thing
- Notion API for database queries, filtering, sorting, page management
- Google Calendar + Gmail APIs
- Claude Code CLI as reasoning layer

## Version History

| Version | Name | Description | Status |
|---------|------|-------------|--------|
| v1 | Cortex | Large markdown instruction files (100+ lines each) passed to tools. Unsustainable — token usage exploded, fragile. | Abandoned |
| v2 | Jarvis Engine | Small versatile TypeScript scripts, each does one thing. Current version. Migration from Cortex incomplete. | Active |
| v3 | Gemini Integration | Gemini CLI integration for more generous API limits. Completely untested. | Experimental |

## Key Lessons

- Constraints force good design: unlimited tokens → lazy; limited tokens → deliberate
- Migration harder than building from scratch
- Build in layers: each version answers a question, answers pile up into real system
- Small scripts > bloated markdown files

## Status

- **Active (v2)** — migration from Cortex incomplete, may have untested failure points

## Links

- [[Coding Environment – MacBook]]
- [[Side Project – AI Knowledge Hub]]
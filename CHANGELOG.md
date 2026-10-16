# Changelog

## Unreleased

- Enable native MCP and deferred tool discovery in the isolated Xuegen profile.
- Forward `xuegen mcp` management commands and document pinned arXiv/PDF and Fetch installations.
- Store Python MCP environments in `mcp-tools/` to avoid the runtime's legacy `tools/` migration warning.
- Add opt-in `wiki-save` for existing Wiki relationships and Anki cards, with a private `wiki.json` vault binding.
- Keep teaching independent of Wiki access; reuse vault rules and preserve existing card IDs during requested saves.
- Add opt-in `course` with one Wiki page per course for materials, plans, evidence-linked activity checkboxes, and concise learning records.
- Keep course selection per conversation; preserve manual edits and avoid duplicate closing records when nothing changed.
- Route Wiki queries through a read-only workflow without updating pages or logs.
- Normalize and export `XUEGEN_HOME` so tool-side Wiki lookup matches the runtime profile, including relative paths.
- Render dated course PNG snapshots with weekly goals, overall milestones, learning evidence, and next steps using local Chrome without new dependencies.
- Preserve Markdown as the source of truth; reject invalid completion flags and avoid overwriting existing snapshots.

## 0.1.0

- Add the `xuegen` command with an independent local profile and learning identity.
- Include the `teach` workflow: diagnose, plan, derive, check, and review.
- Load bundled skills explicitly while disabling automatic discovery of unrelated configuration.
- Pin the upstream terminal runtime; keep credentials, sessions, and notes outside the distributable project.

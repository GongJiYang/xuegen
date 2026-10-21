# Changelog

## Unreleased

- Add the `article` skill for abstracting learning material into precise knowledge hierarchies without drafting prose.
- Default new profiles, and profiles without an explicit `tuiMode`, to Pi's regular terminal mode so the input editor follows terminal scrollback instead of staying in the fullscreen dock.

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
- Move course state to `wiki/courses/<slug>.md` and keep it read-only (0444 with a 0555 directory) so it can only change through the unlock-edit-relock workflow.
- Generate a `wiki/courses.md` dashboard from the per-course state files, and add a read-only `course-board` skill that displays courses and verifies locks and dashboard consistency.
- Support checking off and reverting activities at the end of a day, keeping an audit line instead of deleting the earlier checkmark.
- Render a self-contained read-only `wiki/courses.html` board from the same course Markdown: no server, scripts, CDN, or edit controls; opens offline and follows the system light/dark theme.
- Define the standard plan output (position, next step, week, today, milestones, full plan, records) in `skills/course/PLAN-STANDARD.md`, illustrated with the mech-interp course.

## 0.1.0

- Add the `xuegen` command with an independent local profile and learning identity.
- Include the `teach` workflow: diagnose, plan, derive, check, and review.
- Load bundled skills explicitly while disabling automatic discovery of unrelated configuration.
- Pin the upstream terminal runtime; keep credentials, sessions, and notes outside the distributable project.

/**
 * Composer `/` command state.
 *
 * Owns the open/closed state, the current query (the text after `/`), the
 * highlighted index, and the filtered/grouped lists, so the composer is a plain
 * view over this hook. All the list logic is the pure `commands.ts`; this only
 * holds the transient selection.
 */

import { useCallback, useMemo, useState } from "react";
import type { CommandInfo } from "@shared/protocol.js";
import {
  allCommands,
  groupCommands,
  moveSelection,
  opensSlashMenu,
  rankCommands,
  type SlashCommand,
} from "./commands.js";

export interface SlashState {
  open: boolean;
  commands: SlashCommand[];
  groups: ReturnType<typeof groupCommands>;
  selected: number;
  /** Recompute the menu for the composer's current text. */
  update(text: string): void;
  select(index: number): void;
  move(delta: number): void;
  close(): void;
}

/**
 * @param agentCommands The `/skill:<name>` entries the agent reports.
 * @param disabledSkills Skills the user turned off; filtered out locally so the
 *   menu updates in step with the checkbox, not only after the agent re-sends
 *   its command list.
 */
export function useSlash(agentCommands: CommandInfo[], disabledSkills: readonly string[] = []): SlashState {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);

  const all = useMemo(() => allCommands(agentCommands, disabledSkills), [agentCommands, disabledSkills]);
  const commands = useMemo(() => rankCommands(all, query), [all, query]);
  const groups = useMemo(() => groupCommands(commands), [commands]);

  const update = useCallback(
    (text: string) => {
      if (!opensSlashMenu(text)) {
        setOpen(false);
        setQuery("");
        setSelected(0);
        return;
      }
      setOpen(true);
      setQuery(text.slice(1).trim());
      setSelected(0);
    },
    [],
  );

  const close = useCallback(() => setOpen(false), []);

  const move = useCallback(
    (delta: number) => setSelected((current) => moveSelection(current, delta, commands.length)),
    [commands.length],
  );

  return { open, commands, groups, selected, update, select: setSelected, move, close };
}

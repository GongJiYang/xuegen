/**
 * Bear `/` command menu.
 *
 * A thin-ruled list floating above the composer: one soft group header per
 * group and a row per command (command in ink, description in soft). The
 * selected/hovered row gets a `--code-bg` block. The keyboard (↑ ↓ Enter Esc)
 * is handled by the composer; this component only renders and reports hovers /
 * clicks.
 */

import type { SlashMenuProps } from "../contract.js";
import { strings } from "../../core/strings.js";

export function SlashMenu({ groups, commands, selected, onSelect, onRun }: SlashMenuProps) {
  return (
    <div className="bear-slash" role="listbox" aria-label={strings.input.slashHint}>
      {commands.length === 0 ? (
        <div className="bear-slash-item">
          <span className="bear-slash-desc">{strings.input.slashEmpty}</span>
        </div>
      ) : (
        groups.map((group) => (
          <div key={group.group}>
            <div className="bear-slash-group">{group.group}</div>
            {group.commands.map((command) => {
              const index = commands.indexOf(command);
              return (
                <button
                  key={command.command}
                  type="button"
                  role="option"
                  aria-selected={index === selected}
                  data-selected={index === selected ? "true" : undefined}
                  className="bear-slash-item"
                  onMouseDown={(event) => event.stopPropagation()}
                  onMouseEnter={() => onSelect(index)}
                  onClick={() => onRun(command)}
                >
                  <span>{command.command}</span>
                  <span className="bear-slash-desc">{command.description}</span>
                </button>
              );
            })}
          </div>
        ))
      )}
    </div>
  );
}

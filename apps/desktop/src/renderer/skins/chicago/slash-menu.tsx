/**
 * Chicago `/` command menu.
 *
 * The design's `.slash`: a box above the composer with one `.grp` header per
 * group and a `.c` row per command (command in Chicago, description in body
 * font). The highlighted row inverts. The keyboard (↑ ↓ Enter Esc) is handled by
 * the composer; this component only renders and reports hovers / clicks.
 */

import type { SlashMenuProps } from "../contract.js";
import { strings } from "../../core/strings.js";

export function SlashMenu({ groups, commands, selected, onSelect, onRun }: SlashMenuProps) {
  return (
    <div className="chicago-slash chicago-show">
      {commands.length === 0 ? (
        <div className="chicago-c">
          <span>{strings.input.slashEmpty}</span>
        </div>
      ) : (
        groups.map((group) => (
          <div key={group.group}>
            <div className="chicago-grp">{group.group}</div>
            {group.commands.map((command) => {
              const index = commands.indexOf(command);
              return (
                <div
                  key={command.command}
                  className={`chicago-c${index === selected ? " chicago-hi" : ""}`}
                  onMouseDown={(event) => event.stopPropagation()}
                  onMouseEnter={() => onSelect(index)}
                  onClick={() => onRun(command)}
                >
                  <b>{command.command}</b>
                  <span>{command.description}</span>
                </div>
              );
            })}
          </div>
        ))
      )}
    </div>
  );
}

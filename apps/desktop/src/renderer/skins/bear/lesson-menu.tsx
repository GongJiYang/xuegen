/**
 * 总控 v3 (`control-v3.html` ②③): a 上课 row's 「⋯」 menu and the 学过了 dialog.
 * All three items only hand words to 总控 (a message in the 动态 feed); nothing
 * here writes a file, and every label comes from `core/strings.ts`.
 */

import { useState } from "react";
import {
  Content as DropdownMenuContent,
  Item as DropdownMenuItem,
  Portal as DropdownMenuPortal,
  Root as DropdownMenu,
  Separator as DropdownMenuSeparator,
  Trigger as DropdownMenuTrigger,
} from "@animate-ui/react/primitives/radix-ui/dropdown-menu";
import { Dialog as RadixDialog } from "radix-ui";
import type { ControlCardRow, LessonRef } from "../../core/board/control-card.js";
import { strings } from "../../core/strings.js";
import type { ControlLessonMenu } from "../contract.js";
import { compareText } from "../../../shared/text-order.js";

export interface SelfReportDialogProps {
  open: boolean;
  /** The lessons this dialog may tick, in the order the ids are handed over. */
  lessons: LessonRef[];
  /** The ids ticked when the dialog opens. */
  checked: string[];
  menu: ControlLessonMenu;
  onClose(): void;
}

/**
 * 学过了: confirm which lessons to tick, then hand them to 总控 as one message.
 * Controlled by its parent — the open state stays outside so the menu item that
 * opens it keeps the trigger's focus.
 */
export function SelfReportDialog({ open, lessons, checked, menu, onClose }: SelfReportDialogProps) {
  const t = strings.control.card.selfReport;
  const [on, setOn] = useState<string[]>(checked);
  const [wasOpen, setWasOpen] = useState(open);

  // Re-seed the ticks on every opening: `checked` describes that opening only.
  // Adjusting during render (instead of in an effect) keeps the first paint and
  // the state consistent, and avoids a cascading render.
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setOn(checked);
  }

  if (lessons.length === 0) return null;

  // Lesson order, not click order: 总控 reads the ids as a list of 课次.
  const ids = lessons.map((lesson) => lesson.id).filter((id) => on.includes(id));
  const first = lessons[0]!; // guarded by the length check above

  const toggle = (id: string): void => {
    setOn((current) => (current.includes(id) ? current.filter((each) => each !== id) : [...current, id]));
  };

  return (
    <RadixDialog.Root open={open} onOpenChange={(next) => !next && onClose()}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="bear-dlg-overlay" />
        <RadixDialog.Content className="bear-dlg bear-sr" aria-describedby="bear-sr-note">
          <RadixDialog.Title className="bear-dlg-title">{t.title}</RadixDialog.Title>
          <p id="bear-sr-note" className="bear-sr-note">
            {t.note}
          </p>
          <ul className="bear-sr-list">
            {lessons.map((lesson) => {
              const ticked = on.includes(lesson.id);
              return (
                <li key={lesson.id}>
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={ticked}
                    aria-label={`${lesson.name} ${lesson.id}`}
                    className={`bear-cc-box${ticked ? " is-on" : ""}`}
                    onClick={() => toggle(lesson.id)}
                  >
                    {ticked ? "✓" : ""}
                  </button>
                  <span className="bear-sr-text">
                    {`${lesson.name} ${lesson.id} · ${lesson.content}`}
                    <span className="bear-cc-sub">{t.planned(lesson.date.slice(5))}</span>
                  </span>
                </li>
              );
            })}
          </ul>
          <p className="bear-sr-later">{t.later}</p>
          <div className="bear-sr-actions">
            <button type="button" className="bear-btn" onClick={onClose}>
              {t.cancel}
            </button>
            <button
              type="button"
              className="bear-btn-primary"
              disabled={ids.length === 0}
              onClick={() => {
                menu.onSelfReport(first.slug, first.name, ids);
                onClose();
              }}
            >
              {t.submit(ids.length)}
            </button>
          </div>
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}

export interface LessonMenuButtonProps {
  row: ControlCardRow;
  /** Every row of today's card: other rows of the same course feed the dialog's list. */
  rows: ControlCardRow[];
  menu: ControlLessonMenu;
  busy?: boolean;
}

/** The 「⋯」 on a not-done 上课 row: 学过了 / 挪到别的日子 / 这节讲什么. */
export function LessonMenuButton({ row, rows, menu, busy }: LessonMenuButtonProps) {
  const m = strings.control.card.menu;
  const [dialog, setDialog] = useState(false);

  const own = row.lessons ?? [];
  const first = own[0];
  if (first === undefined) return null;

  const others = rows
    .filter((other) => other !== row)
    .flatMap((other) => other.lessons ?? [])
    .filter((lesson) => lesson.slug === first.slug);

  const listed: LessonRef[] = [];
  for (const lesson of [...own, ...others]) {
    if (!listed.some((each) => each.id === lesson.id)) listed.push(lesson);
  }
  listed.sort((a, b) => compareText(a.date, b.date));

  return (
    <>
      {/* Non-modal: the row and the transcript behind it stay readable. */}
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger className="bear-cc-more" aria-label={m.label(row.text)} disabled={busy}>
          ⋯
        </DropdownMenuTrigger>
        <DropdownMenuPortal>
          <DropdownMenuContent className="bear-menu bear-lm" align="end" sideOffset={6}>
            <DropdownMenuItem onSelect={() => setDialog(true)}>
              <span className="bear-lm-item">
                <b>{m.done}</b>
                <small>{m.doneSub}</small>
              </span>
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => menu.onMove(first)}>
              <span className="bear-lm-item">
                <b>{m.move}</b>
                <small>{m.moveSub}</small>
              </span>
            </DropdownMenuItem>
            <DropdownMenuSeparator className="bear-lm-sep" />
            <DropdownMenuItem onSelect={() => menu.onAsk(first)}>
              <span className="bear-lm-item">
                <b>{m.ask}</b>
                <small>{m.askSub}</small>
              </span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenuPortal>
      </DropdownMenu>
      <SelfReportDialog
        open={dialog}
        lessons={listed}
        checked={own.map((lesson) => lesson.id)}
        menu={menu}
        onClose={() => setDialog(false)}
      />
    </>
  );
}

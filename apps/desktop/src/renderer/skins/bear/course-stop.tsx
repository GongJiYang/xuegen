/**
 * 总进度 v3 (`logic-ui-1116.html` B): the 「⋯」 on a main course row and the
 * 已停用 fold under the course list. Stopping asks first (「取消」 has the
 * focus); resuming is one click per row. Every label comes from
 * `core/course-stop/strings.ts`.
 */

import { useState } from "react";
import {
  Content as DropdownMenuContent,
  Item as DropdownMenuItem,
  Portal as DropdownMenuPortal,
  Root as DropdownMenu,
  Trigger as DropdownMenuTrigger,
} from "@animate-ui/react/primitives/radix-ui/dropdown-menu";
import { Dialog as RadixDialog } from "radix-ui";
import { courseStopStrings } from "../../core/course-stop/strings.js";
import { summaryLine, type StoppedCourse } from "../../core/course-stop/view.js";

export interface CourseMenuProps {
  slug: string;
  name: string;
  /** The course whose stop / resume is running, or null. */
  pending: string | null;
  onStop(slug: string): void;
}

/** 「⋯」 on a main course row: 停用这门课… behind a confirmation dialog. */
export function CourseMenu({ slug, name, pending, onStop }: CourseMenuProps) {
  const [dialog, setDialog] = useState(false);

  return (
    <>
      {/* Non-modal: the panel behind the menu stays readable. */}
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger
          className="bear-cc-more"
          aria-label={courseStopStrings.more(name)}
          disabled={pending !== null}
        >
          ⋯
        </DropdownMenuTrigger>
        <DropdownMenuPortal>
          <DropdownMenuContent className="bear-menu bear-lm" align="end" sideOffset={6}>
            <DropdownMenuItem onSelect={() => setDialog(true)}>
              <span className="bear-lm-item">
                <b>{courseStopStrings.stop}</b>
              </span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenuPortal>
      </DropdownMenu>
      <RadixDialog.Root open={dialog} onOpenChange={(next) => !next && setDialog(false)}>
        <RadixDialog.Portal>
          <RadixDialog.Overlay className="bear-dlg-overlay" />
          <RadixDialog.Content className="bear-dlg bear-cs">
            <RadixDialog.Title className="bear-dlg-title">{courseStopStrings.dialogTitle(name)}</RadixDialog.Title>
            <p className="bear-sr-note">{courseStopStrings.dialogBody1}</p>
            <p className="bear-sr-note">{courseStopStrings.dialogBody2}</p>
            <div className="bear-sr-actions">
              <button type="button" className="bear-btn" autoFocus onClick={() => setDialog(false)}>
                {courseStopStrings.cancel}
              </button>
              <button
                type="button"
                className="bear-btn-primary"
                disabled={pending !== null}
                onClick={() => {
                  onStop(slug);
                  setDialog(false);
                }}
              >
                {pending === slug ? courseStopStrings.stopping : courseStopStrings.confirm}
              </button>
            </div>
          </RadixDialog.Content>
        </RadixDialog.Portal>
      </RadixDialog.Root>
    </>
  );
}

export interface StoppedListProps {
  stopped: StoppedCourse[];
  /** The course whose stop / resume is running, or null. */
  pending: string | null;
  error: string | null;
  onResume(slug: string): void;
}

/** 「已停用 2 门 · …」, a fold with one 恢复 per course; nothing when empty. */
export function StoppedList({ stopped, pending, error, onResume }: StoppedListProps) {
  if (stopped.length === 0) return null;
  return (
    <details className="bear-cp-stopped">
      <summary className="bear-cp-meta">{summaryLine(stopped)}</summary>
      <ul>
        {stopped.map((course) => (
          <li key={course.slug}>
            <span>{course.name}</span>
            <span className="bear-cp-meta">
              {course.on === "" ? "" : courseStopStrings.on(course.on)}
            </span>
            <button
              type="button"
              className="bear-link"
              disabled={pending !== null}
              onClick={() => onResume(course.slug)}
            >
              {pending === course.slug ? courseStopStrings.resuming : courseStopStrings.resume}
            </button>
          </li>
        ))}
      </ul>
      {error !== null && (
        <p className="bear-cp-meta" role="status">
          {error}
        </p>
      )}
    </details>
  );
}

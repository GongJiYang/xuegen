/**
 * Chicago dialog frame.
 *
 * The nested double border the design uses for the exercise and alert dialogs:
 * an outer 1px frame, a 2px gap, and an inner 3px frame. A titled head sits
 * inside. Kept as one component so the exercise, alert, and any future dialog
 * share the exact pixel frame.
 */

import type { ReactNode } from "react";

/** A framed dialog with an optional Chicago-12 title. */
export function Dialog({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="chicago-dialog">
      <div className="chicago-dialog-inner">
        {title && <div className="chicago-dialog-head">{title}</div>}
        {children}
      </div>
    </div>
  );
}

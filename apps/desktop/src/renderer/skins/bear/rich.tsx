/**
 * Inline `code` in plan and course text.
 *
 * Course files write identifiers in backticks (`@deco`); the panels show those
 * as <code> instead of raw backticks. Everything else stays plain text.
 */

import { Fragment } from "react";

export function Rich({ text }: { text: string }) {
  const parts = text.split(/(`[^`]+`)/);
  return (
    <>
      {parts.map((part, index) =>
        part.length > 2 && part.startsWith("`") && part.endsWith("`") ? (
          <code key={index}>{part.slice(1, -1)}</code>
        ) : (
          <Fragment key={index}>{part}</Fragment>
        ),
      )}
    </>
  );
}

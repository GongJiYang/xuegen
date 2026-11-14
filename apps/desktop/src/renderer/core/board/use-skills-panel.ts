/**
 * The skills panel: list state plus the fetch/review dialog state.
 *
 * Toggling a skill returns the authoritative settings, so the caller applies
 * them and the agent's `disabledSkills` (and the `/` menu) update in step. The
 * fetch result line and the pending-skill review are panel-local UI state and
 * live here rather than in `App`.
 */

import { useState } from "react";
import type { SkillReview } from "@shared/data-protocol.js";
import type { DesktopSettings } from "@shared/protocol.js";
import type { ShellPanels } from "../../skins/contract.js";
import type { AsyncState } from "./state.js";
import { strings } from "../strings.js";
import type { SkillsResource } from "./use-skills.js";

/** Build the skills panel's view model and callbacks. */
export function useSkillsPanel(
  skills: SkillsResource,
  apply: (settings: DesktopSettings) => void,
): ShellPanels["skills"] {
  const [fetchNotice, setFetchNotice] = useState<string | null>(null);
  const [review, setReview] = useState<AsyncState<SkillReview> | null>(null);

  return {
    skills: skills.resource.state,
    onToggle: (name, enabled) => {
      // The write returns the authoritative settings; apply them so the
      // session's `disabledSkills` (and the `/` menu) update in step.
      void skills.setEnabled(name, enabled).then((result) => {
        if (result.ok) apply(result.data);
      });
    },
    onFetch: (url) => {
      setFetchNotice(null);
      void skills.fetch(url).then((result) => {
        setFetchNotice(
          result.ok
            ? strings.skills.fetched(result.data.skills.map((skill) => skill.name))
            : strings.skills.fetchFailed(result.error),
        );
      });
    },
    fetchNotice,
    review,
    onReview: (name) => {
      setReview({ status: "loading" });
      void skills
        .review(name)
        .then((result) =>
          setReview(
            result.ok
              ? { status: "ready", value: result.data }
              : { status: "error", code: result.code, message: result.error },
          ),
        );
    },
    onCloseReview: () => setReview(null),
    onEnableReviewed: (name) => {
      setReview(null);
      void skills.setEnabled(name, true).then((result) => {
        if (result.ok) apply(result.data);
        else setFetchNotice(strings.skills.fetchFailed(result.error));
      });
    },
    onDiscardReviewed: (name) => {
      setReview(null);
      void skills.discard(name);
    },
  };
}

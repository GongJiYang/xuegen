/**
 * Skills view model.
 *
 * Wraps `skills.list` (builtin / personal / pending, each with an enabled flag)
 * and the two writes: toggling a skill's enabled state, and fetching a repo into
 * the pending area. Toggling a skill also drives the `/` menu's 技能 group, which
 * the caller re-requests from the agent after a successful toggle.
 */

import type { DesktopSettings } from "@shared/protocol.js";
import type { SkillInfo, SkillReview } from "@shared/data-protocol.js";
import * as client from "../client.js";
import { useBoardResource, type BoardResource, type LoadResult } from "./use-resource.js";

export interface SkillsResource {
  resource: BoardResource<SkillInfo[]>;
  /** Toggle a skill; resolves with the authoritative settings on success. */
  setEnabled(name: string, enabled: boolean): Promise<LoadResult<DesktopSettings>>;
  /** Fetch a skill repo; resolves with every skill it held (all pending). */
  fetch(url: string): Promise<LoadResult<{ skills: { name: string; path: string }[] }>>;
  /** Load what the review dialog shows for a pending skill. */
  review(name: string): Promise<LoadResult<SkillReview>>;
  /** Delete a pending skill. */
  discard(name: string): Promise<LoadResult<{ name: string }>>;
  reload(): void;
}

export function useSkills(): SkillsResource {
  const resource = useBoardResource(() => client.data({ kind: "skills.list" }), []);
  return {
    resource,
    reload: resource.reload,
    setEnabled: (name, enabled) =>
      resource.mutate(() => client.data({ kind: "skills.setEnabled", name, enabled })),
    fetch: (url) => resource.mutate(() => client.data({ kind: "skills.fetch", url })),
    review: (name) => client.data({ kind: "skills.review", name }),
    discard: (name) => resource.mutate(() => client.data({ kind: "skills.discard", name })),
  };
}

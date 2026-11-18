/**
 * 停用 / 恢复一门课（logic-ui-1116.html B）。
 *
 * The write goes through the data channel; a successful `course.stop` /
 * `course.resume` reloads the course list plus the cycle views that drop or take
 * the course back. A synchronous lock holds until the request settles so a
 * double click sends only one request.
 */

import { useRef, useState } from "react";
import type { CourseSummary } from "@shared/data-protocol.js";
import * as client from "../client.js";
import { courseStopStrings } from "./strings.js";
import { stoppedList, type CourseStopProps } from "./view.js";

type StopKind = "course.stop" | "course.resume";

export function useCourseStop(courses: CourseSummary[] | null, reload: () => void): CourseStopProps {
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);

  const run = async (slug: string, kind: StopKind): Promise<void> => {
    if (inFlight.current) return;
    inFlight.current = true;
    setPending(slug);
    setError(null);
    try {
      const request =
        kind === "course.stop" ? { kind: "course.stop" as const, slug } : { kind: "course.resume" as const, slug };
      const result = await client.data(request);
      if (result.ok) reload();
      else setError(courseStopStrings.failed(result.error));
    } finally {
      inFlight.current = false;
      setPending(null);
    }
  };

  return {
    stopped: stoppedList(courses),
    pending,
    error,
    onStop: (slug) => {
      void run(slug, "course.stop");
    },
    onResume: (slug) => {
      void run(slug, "course.resume");
    },
  };
}

/**
 * 开下一周期: the banner and the five-step wizard's state.
 *
 * Opening loads `cycle.accept`; the last step loads `cycle.preview` for the
 * chosen mains and start. 「交给总控写入」 sends one marked message — the wizard
 * itself writes nothing (see `next-cycle.ts`).
 */

import { useRef, useState } from "react";
import type { CycleAccept, CycleOverview, CyclePreview, SubjectsOverview } from "@shared/data-protocol.js";
import type { NextCycleView } from "../../skins/contract.js";
import * as client from "../client.js";
import { strings } from "../strings.js";
import {
  acceptRows,
  defaultMaterial,
  mainOptions,
  materialOptions,
  nextCycleBanner,
  nextCyclePrompt,
  nextStart,
  previewCells,
  shelfKey,
  toggleMain,
  type MainFrom,
  type Shortfall,
} from "./next-cycle.js";
import type { UnplannedMaterial } from "./panel.js";

export interface NextCycleInput {
  enabled: boolean;
  overview: CycleOverview | null;
  subjects: SubjectsOverview | null;
  unplanned: UnplannedMaterial[] | null;
  /** Course slug → short name. */
  names: Readonly<Record<string, string>>;
  send(text: string): void;
}

type Load<T> = { status: "loading" } | { status: "error"; error: string } | { status: "ready"; value: T };

const LAST_STEP = 4;

export function useNextCycle(input: NextCycleInput): NextCycleView | undefined {
  const banner = input.enabled ? nextCycleBanner(input.overview) : null;
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [accept, setAccept] = useState<Load<CycleAccept>>({ status: "loading" });
  const [shortfall, setShortfall] = useState<Shortfall>("recover");
  const [mains, setMains] = useState<string[]>([]);
  const [picks, setPicks] = useState<Record<string, string | null>>({});
  const [froms, setFroms] = useState<Record<string, MainFrom>>({});
  const [shelf, setShelf] = useState<string[]>([]);
  const [preview, setPreview] = useState<Load<CyclePreview>>({ status: "loading" });
  const ticket = useRef(0);

  const cycle = banner?.cycle ?? null;
  const ready = accept.status === "ready" ? accept.value : null;
  const rows = ready === null ? [] : acceptRows(ready, input.names);
  const unmet = rows.filter((row) => !row.met);
  const decided: Shortfall | null = unmet.length === 0 ? null : shortfall;
  const start = ready === null ? null : nextStart(ready, decided);

  const loadAccept = (name: string): void => {
    const current = (ticket.current += 1);
    setAccept({ status: "loading" });
    void client.data({ kind: "cycle.accept", cycle: name }).then((result) => {
      if (current !== ticket.current) return;
      if (!result.ok) return setAccept({ status: "error", error: result.error });
      setAccept({ status: "ready", value: result.data });
      setMains(result.data.next?.mains.slice(0, 2) ?? []);
    });
  };
  const loadPreview = (): void => {
    if (ready === null || start === null || mains.length === 0) return;
    const current = (ticket.current += 1);
    setPreview({ status: "loading" });
    void client.data({ kind: "cycle.preview", from: ready.cycle, start, main: mains }).then((result) => {
      if (current !== ticket.current) return;
      setPreview(result.ok ? { status: "ready", value: result.data } : { status: "error", error: result.error });
    });
  };

  if (!input.enabled) return undefined;

  const subjects = input.subjects?.subjects ?? [];
  const guides = input.overview?.cycle?.auxSubjects ?? [];
  const shortNames = input.overview?.cycle?.subjects ?? {};
  const next = ready?.next?.cycle ?? banner?.next ?? "";
  const close = (): void => {
    ticket.current += 1;
    setOpen(false);
  };
  const pickOf = (slug: string): string | null => {
    if (slug in picks) return picks[slug] ?? null;
    const subject = subjects.find((item) => item.slug === slug);
    return subject === undefined ? null : defaultMaterial(subject);
  };
  const fromOf = (slug: string): MainFrom | null => (guides.includes(slug) ? (froms[slug] ?? "continue") : null);
  const candidates = input.unplanned ?? [];

  const submit = (): void => {
    if (ready === null || start === null) return;
    input.send(
      nextCyclePrompt({
        accept: ready,
        rows,
        shortfall: decided,
        start,
        mains: mains.map((slug) => ({
          slug,
          name: subjects.find((item) => item.slug === slug)?.title ?? slug,
          material: pickOf(slug),
          from: fromOf(slug),
        })),
        shelf: candidates
          .filter((material) => shelf.includes(shelfKey(material)))
          .map((material) => ({ title: material.title, subjectTitle: material.subjectTitle })),
      }),
    );
    close();
  };

  const canNext =
    ready !== null &&
    start !== null &&
    (step !== 1 || mains.length > 0) &&
    (step !== LAST_STEP || preview.status !== "loading");
  const stoppedGuides = mains.filter((slug) => guides.includes(slug)).map((slug) => shortNames[slug] ?? slug);

  return {
    banner: banner?.text ?? null,
    onOpen: () => {
      if (cycle === null) return;
      loadAccept(cycle);
      setStep(0);
      setShortfall("recover");
      setPicks({});
      setFroms({});
      setShelf([]);
      setOpen(true);
    },
    wizard: !open
      ? null
      : {
          title: strings.nextCycle.title(next),
          meta: ready === null ? "" : strings.nextCycle.meta(ready.cycle, ready.start, ready.end),
          steps: strings.nextCycle.steps(ready?.cycle ?? cycle ?? ""),
          step,
          state: accept.status,
          error:
            accept.status === "error"
              ? accept.error
              : ready !== null && ready.next === null
                ? strings.nextCycle.noNext
                : null,
          accept: {
            rows,
            shortfall: decided,
            options: [
              { value: "recover", label: strings.nextCycle.recover, meta: strings.nextCycle.recoverMeta(next) },
              {
                value: "partial",
                label: strings.nextCycle.partial(next, unmet.map((row) => row.name).join("、")),
                meta: strings.nextCycle.partialMeta(ready?.cycle ?? ""),
              },
            ],
            onShortfall: setShortfall,
          },
          mains: {
            caption: strings.nextCycle.mainsCaption(next),
            options: mainOptions(subjects, ready?.next?.mains ?? [], guides).map((option) => ({
              ...option,
              checked: mains.includes(option.slug),
              disabled: !mains.includes(option.slug) && mains.length >= 2,
              meta: [
                option.suggested ? strings.nextCycle.mainSuggested : "",
                option.guide ? strings.nextCycle.mainGuide(ready?.cycle ?? "") : "",
              ]
                .filter((part) => part !== "")
                .join(" · "),
            })),
            onToggle: (slug) => setMains((current) => toggleMain(current, slug)),
          },
          materials: {
            groups: mains.map((slug) => {
              const subject = subjects.find((item) => item.slug === slug);
              return {
                slug,
                name: subject?.title ?? slug,
                options: subject === undefined ? [] : materialOptions(subject),
                picked: pickOf(slug),
                onPick: (title: string) => setPicks((current) => ({ ...current, [slug]: title })),
                from: fromOf(slug),
                onFrom: (value: MainFrom) => setFroms((current) => ({ ...current, [slug]: value })),
              };
            }),
          },
          shelf: {
            options: candidates.map((material) => ({
              key: shelfKey(material),
              title: material.title,
              meta: [material.subjectTitle, material.type, material.role].filter((part) => part !== "").join(" · "),
              checked: shelf.includes(shelfKey(material)),
            })),
            onToggle: (key) =>
              setShelf((current) => (current.includes(key) ? current.filter((item) => item !== key) : [...current, key])),
            note: strings.nextCycle.shelfNote(stoppedGuides.join("、")),
          },
          preview: {
            caption: strings.nextCycle.previewCaption(next, start ?? ""),
            state: preview.status,
            cells: preview.status === "ready" ? previewCells(preview.value.days, mains) : [],
          },
          canNext: canNext && !(ready !== null && ready.next === null),
          onBack: () => {
            if (step === 0) return close();
            ticket.current += 1;
            setStep(step - 1);
          },
          onNext: () => {
            if (step === LAST_STEP) return submit();
            if (step + 1 === LAST_STEP) loadPreview();
            setStep(step + 1);
          },
          onClose: close,
        },
  };
}

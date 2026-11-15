/**
 * The 领域 page in the left column (user 11-15, `domain.html` ①): the skin's
 * `DomainPanel` slot plus the Markdown renderer it needs for the page being read.
 *
 * It lives beside `App` because the slot components only exist once a skin has
 * resolved — the same reason `use-control-planbook` hands `App` props instead of
 * an element — and keeping it here keeps `App` inside its line budget.
 */

import { useEffect, useRef, type ReactNode } from "react";
import { MessageRenderer } from "../chat/message-renderer.js";
import type { ChatController } from "../chat/useChat.js";
import type { useExerciseActions } from "../chat/use-exercise-actions.js";
import { wikilinkHrefTarget } from "../content/wikilink.js";
import type { SkinModule } from "../../skins/contract.js";
import { domainSections, findPage } from "./domain.js";
import type { DomainSession } from "./use-domain-session.js";
import type { DomainState } from "./use-domain.js";

export interface DomainSlotProps {
  skin: SkinModule;
  /** The open 领域 session's subject and the subject list for 「换科目」. */
  domainSession: DomainSession;
  domain: DomainState;
  controller: Pick<ChatController, "retry">;
  exercise: ReturnType<typeof useExerciseActions>;
}

export function DomainSlot({
  skin,
  domainSession,
  domain,
  controller,
  exercise,
}: DomainSlotProps): ReactNode {
  const { DomainPanel } = skin.slots;
  // A citation chip in an answer (domain.html ③) opens that page in the centre.
  // The chip is a `#wiki:<target>` fragment link, so without a handler the click
  // would only scroll: nothing here navigates anywhere, and a target that is not
  // a page of this subject (a course record, say) is simply left alone.
  //
  // The handler reads the state through a ref: `domain` is a fresh object on
  // every App render (one per streamed token), so binding it directly would tear
  // down and re-add the document listener on every token.
  const latest = useRef(domain);
  useEffect(() => {
    latest.current = domain;
  });
  useEffect(() => {
    const onClick = (event: MouseEvent): void => {
      const element = event.target as Element | null;
      const anchor = element?.closest?.("a.xg-wikilink") ?? null;
      if (anchor === null) return;
      event.preventDefault();
      const name = wikilinkHrefTarget(anchor.getAttribute("href"));
      const state = latest.current;
      const glossary = state.glossary;
      if (name === null || glossary === null || glossary === "failed") return;
      const found = findPage(domainSections(glossary), name);
      if (found !== null) state.openPage(found.entry, found.label);
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, []);

  const open = domainSession.current;
  if (open === null) return null;
  const subjects = domainSession.subjects ?? [];
  return (
    <DomainPanel
      title={open.title}
      subjects={subjects.map((subject) => ({ id: subject.id, label: subject.title }))}
      current={open.subject}
      onSwitchSubject={(id) =>
        domainSession.open(id, subjects.find((subject) => subject.id === id)?.title ?? id)
      }
      domain={domain}
      renderMarkdown={(markdown) => (
        <MessageRenderer
          slots={skin.slots}
          content={skin.content}
          message={{ id: "domain-page", role: "assistant", markdown, streaming: false, toolCalls: [] }}
          thinking={false}
          onRetry={controller.retry}
          onExerciseAnswer={exercise.onAnswer}
          onExerciseHint={exercise.onHint}
          onExerciseSkip={exercise.onSkip}
        />
      )}
    />
  );
}

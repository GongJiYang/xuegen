/**
 * The 总控 wide reader: one turn's full answer (from a feed card or the change
 * banner), or a wiki page (a 术语 link) read through `wiki.read`.
 */

import { useRef, useState } from "react";
import type { ChatMessage } from "@shared/protocol.js";
import * as client from "../client.js";
import { strings } from "../strings.js";
import type { ActivityCard } from "./activity-feed.js";
import { obsidianUrl, stripTitle } from "./terms.js";

export interface ReaderView {
  title: string;
  sub: string;
  /** Rendered with the transcript's message renderer. */
  messages: ChatMessage[];
  loading: boolean;
  error: string | null;
  /** `obsidian://` link for a wiki page; null for an answer. */
  external: string | null;
  /** The wiki page shown; null for an answer. */
  path: string | null;
}

export interface Reader {
  view: ReaderView | null;
  openTurn(card: ActivityCard): void;
  openPage(path: string, title: string, sub?: string): void;
  close(): void;
}

export function useReader(): Reader {
  const [view, setView] = useState<ReaderView | null>(null);
  const request = useRef(0);
  return {
    view,
    openTurn: (card) => {
      request.current += 1;
      setView({
        title: card.ask === "" ? strings.feed.title : card.ask,
        sub: strings.feed.readerSteps(card.steps),
        // The step count is in `sub`; the reader shows what 学根 said, not its tool rows.
        messages: card.messages
          .filter((message) => message.role === "assistant")
          .filter((message) => message.markdown.trim() !== "" || message.errorMessage !== undefined)
          .map((message) => ({ ...message, toolCalls: [] })),
        loading: false,
        error: null,
        external: null,
        path: null,
      });
    },
    openPage: (path, title, sub = strings.feed.termCaption) => {
      const ticket = (request.current += 1);
      const base = { title, sub, messages: [], external: obsidianUrl(path), path };
      setView({ ...base, loading: true, error: null });
      void client.data({ kind: "wiki.read", path }).then((result) => {
        if (ticket !== request.current) return;
        if (!result.ok) return setView({ ...base, loading: false, error: result.error });
        const page: ChatMessage = {
          id: path,
          role: "assistant",
          markdown: stripTitle(result.data.markdown),
          streaming: false,
          toolCalls: [],
        };
        setView({ ...base, title: result.data.title, messages: [page], loading: false, error: null });
      });
    },
    close: () => {
      request.current += 1;
      setView(null);
    },
  };
}

/**
 * Which tool window is open, plus a request number that bumps on every open
 * request — also when the same tool is asked for again, so a skin can reopen
 * a dialog the user just closed (Bear's 总控 dialogs).
 */
import { useCallback, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { ToolId } from "../../skins/contract.js";

export function useActiveTool(initial: ToolId | null, onOpen: () => void) {
  const [activeTool, setTool] = useState<ToolId | null>(initial);
  const [toolRequest, setToolRequest] = useState(0);
  // Typed as a `Dispatch` so it can stand in for `App`'s old `setActiveTool`
  // (`useRunCommand` takes one); an updater argument is passed through.
  const setActiveTool: Dispatch<SetStateAction<ToolId | null>> = useCallback((tool) => {
    setTool(tool);
    setToolRequest((n) => n + 1);
  }, []);
  const openTool = useCallback(
    (tool: ToolId) => {
      onOpen();
      setActiveTool(tool);
    },
    [onOpen, setActiveTool],
  );
  return { activeTool, toolRequest, setActiveTool, openTool };
}

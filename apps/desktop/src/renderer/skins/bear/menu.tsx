/**
 * Bear 「⋯」 menu — the only chrome besides the title text.
 *
 * An Animate UI dropdown with submenus: 新会话, 继续会话, 模型 ▸, 思考强度 ▸,
 * 正文字体 ▸, 正文字号 ▸, 皮肤 ▸, 专注模式. Every label comes from
 * `core/strings.ts`; checks are plain `●`/`✓` spans inside the items (the
 * accent is the only colour, and a text mark is quieter than a styled dot).
 */

import {
  Root as DropdownMenu,
  CheckboxItem as DropdownMenuCheckboxItem,
  Content as DropdownMenuContent,
  Item as DropdownMenuItem,
  Portal as DropdownMenuPortal,
  RadioGroup as DropdownMenuRadioGroup,
  RadioItem as DropdownMenuRadioItem,
  Separator as DropdownMenuSeparator,
  Sub as DropdownMenuSub,
  SubContent as DropdownMenuSubContent,
  SubTrigger as DropdownMenuSubTrigger,
  Trigger as DropdownMenuTrigger,
} from "@animate-ui/react/primitives/radix-ui/dropdown-menu";
import { BODY_FONTS, THINKING_LEVEL_LABELS, isBodyFont } from "@shared/protocol.js";
import type { BodyFont, ModelInfo } from "@shared/protocol.js";
import type { SkinChoice } from "../contract.js";
import { strings } from "../../core/strings.js";
import { BEAR_BODY_SCALE_STEPS, bearBodyPx, bearBodyScale } from "./body-scale.js";

export interface MoreMenuProps {
  skins: SkinChoice[];
  activeSkin: string;
  onSelectSkin(id: string): void;
  bodyFont: BodyFont;
  onBodyFont(font: BodyFont): void;
  bodyScale: number;
  onBodyScale(value: number): void;
  models: ModelInfo[];
  currentModel: ModelInfo | null;
  onSelectModel(provider: string, id: string): void;
  thinkingLevel: string | null;
  thinkingLevels: string[];
  onSelectThinking(level: string): void;
  onNewSession(): void;
  onContinueSession(): void;
  focusMode: boolean;
  onToggleFocus(): void;
}

/** A check column: `●` for the selected radio, `✓` for a ticked checkbox. */
function Check({ on, mark = "●" }: { on: boolean; mark?: "●" | "✓" }) {
  return <span className="bear-check" aria-hidden="true">{on ? mark : ""}</span>;
}

export function MoreMenu(props: MoreMenuProps) {
  const scale = String(bearBodyScale(props.bodyScale));
  // Non-modal: the menu must not hide the rest of the window (the ⋯ trigger
  // itself included) or lock the reader while it is open.
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger className="bear-more">⋯</DropdownMenuTrigger>
      <DropdownMenuPortal>
        <DropdownMenuContent className="bear-menu" align="end" sideOffset={6}>
          <DropdownMenuItem onSelect={props.onNewSession}>
            <Check on={false} />
            {strings.topBar.newSession}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={props.onContinueSession}>
            <Check on={false} />
            {strings.topBar.continueSession}
          </DropdownMenuItem>
          <DropdownMenuSeparator className="bear-menu-sep" />

          <DropdownMenuSub>
            <DropdownMenuSubTrigger className="bear-subtrigger">
              <Check on={false} />
              {strings.topBar.modelLabel}
            </DropdownMenuSubTrigger>
            <DropdownMenuPortal>
              <DropdownMenuSubContent className="bear-submenu" sideOffset={4}>
                {props.models.length === 0 ? (
                  <DropdownMenuItem disabled>
                    <Check on={false} />
                    {strings.topBar.modelEmpty}
                  </DropdownMenuItem>
                ) : (
                  <DropdownMenuRadioGroup
                    value={props.currentModel ? `${props.currentModel.provider}::${props.currentModel.id}` : ""}
                    onValueChange={(value) => {
                      const [provider, id] = value.split("::");
                      if (provider && id) props.onSelectModel(provider, id);
                    }}
                  >
                    {props.models.map((model) => (
                      <DropdownMenuRadioItem
                        key={`${model.provider}::${model.id}`}
                        value={`${model.provider}::${model.id}`}
                      >
                        <Check on={props.currentModel?.provider === model.provider && props.currentModel?.id === model.id} />
                        {model.name}
                      </DropdownMenuRadioItem>
                    ))}
                  </DropdownMenuRadioGroup>
                )}
              </DropdownMenuSubContent>
            </DropdownMenuPortal>
          </DropdownMenuSub>

          <DropdownMenuSub>
            <DropdownMenuSubTrigger className="bear-subtrigger">
              <Check on={false} />
              {strings.topBar.thinkingLevel}
            </DropdownMenuSubTrigger>
            <DropdownMenuPortal>
              <DropdownMenuSubContent className="bear-submenu" sideOffset={4}>
                <DropdownMenuRadioGroup
                  value={props.thinkingLevel ?? ""}
                  onValueChange={props.onSelectThinking}
                >
                  {THINKING_LEVEL_LABELS.map((entry) => (
                    <DropdownMenuRadioItem
                      key={entry.id}
                      value={entry.id}
                      disabled={props.thinkingLevel === null || !props.thinkingLevels.includes(entry.id)}
                    >
                      <Check on={props.thinkingLevel === entry.id} />
                      {entry.label}
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              </DropdownMenuSubContent>
            </DropdownMenuPortal>
          </DropdownMenuSub>

          <DropdownMenuSub>
            <DropdownMenuSubTrigger className="bear-subtrigger">
              <Check on={false} />
              {strings.topBar.bodyFont}
            </DropdownMenuSubTrigger>
            <DropdownMenuPortal>
              <DropdownMenuSubContent className="bear-submenu" sideOffset={4}>
                <DropdownMenuRadioGroup
                  value={props.bodyFont}
                  onValueChange={(value) => {
                    if (isBodyFont(value)) props.onBodyFont(value);
                  }}
                >
                  {BODY_FONTS.map((font) => (
                    <DropdownMenuRadioItem key={font} value={font}>
                      <Check on={font === props.bodyFont} />
                      {strings.topBar.fontNames[font]}
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              </DropdownMenuSubContent>
            </DropdownMenuPortal>
          </DropdownMenuSub>

          <DropdownMenuSub>
            <DropdownMenuSubTrigger className="bear-subtrigger">
              <Check on={false} />
              {strings.topBar.bodyScale}
            </DropdownMenuSubTrigger>
            <DropdownMenuPortal>
              <DropdownMenuSubContent className="bear-submenu" sideOffset={4}>
                <DropdownMenuRadioGroup value={scale} onValueChange={(value) => props.onBodyScale(Number(value))}>
                  {BEAR_BODY_SCALE_STEPS.map((step) => (
                    <DropdownMenuRadioItem key={step} value={String(step)}>
                      <Check on={String(step) === scale} />
                      {bearBodyPx(step)}px
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              </DropdownMenuSubContent>
            </DropdownMenuPortal>
          </DropdownMenuSub>

          <DropdownMenuSub>
            <DropdownMenuSubTrigger className="bear-subtrigger">
              <Check on={false} />
              {strings.topBar.appearance}
            </DropdownMenuSubTrigger>
            <DropdownMenuPortal>
              <DropdownMenuSubContent className="bear-submenu" sideOffset={4}>
                <DropdownMenuRadioGroup value={props.activeSkin} onValueChange={props.onSelectSkin}>
                  {props.skins.map((skin) => (
                    <DropdownMenuRadioItem key={skin.id} value={skin.id}>
                      <Check on={skin.id === props.activeSkin} />
                      {skin.name}
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              </DropdownMenuSubContent>
            </DropdownMenuPortal>
          </DropdownMenuSub>
          <DropdownMenuSeparator className="bear-menu-sep" />

          <DropdownMenuCheckboxItem checked={props.focusMode} onCheckedChange={props.onToggleFocus}>
            <Check on={props.focusMode} mark="✓" />
            {strings.topBar.focusMode}
          </DropdownMenuCheckboxItem>
        </DropdownMenuContent>
      </DropdownMenuPortal>
    </DropdownMenu>
  );
}

// Hand-written types for the bundled grokbot-web (only what Xuegen uses). See SOURCE.txt.
import type { CSSProperties, ForwardRefExoticComponent, RefAttributes } from "react";

export type GrokBotState = "idle" | "thinking" | "working" | "notifying" | "sleeping" | "searching" | "writing";

export type GrokBotShape = "blob";

export interface GrokBotTheme {
  bodyColor: string;
  eyeColor: string;
  guideColor: string;
  centroidColor: string;
  badgeColor: string;
  particleColor: string;
}

export interface GrokBotProps {
  state?: GrokBotState;
  shape?: GrokBotShape;
  size?: number | "auto";
  autoBlink?: boolean;
  autoExpression?: boolean;
  theme?: Partial<GrokBotTheme> | null;
  respectReducedMotion?: boolean;
  label?: string;
  className?: string;
  style?: CSSProperties;
}

export interface GrokBotHandle {
  blink(): Promise<void>;
  reset(): void;
}

export declare const GrokBotView: ForwardRefExoticComponent<GrokBotProps & RefAttributes<GrokBotHandle>>;

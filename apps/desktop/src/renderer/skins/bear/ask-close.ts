/**
 * 「交给总控 →」 in 技能与设置 also closes the dialog or drawer it sits in, so
 * the learner sees 总控 answering (P3, 11-17 验收).
 */
import type { SkillsPanelProps } from "../contract.js";

export function withAskClose<P extends { check?: SkillsPanelProps["check"] }>(skills: P, close?: () => void): P {
  const check = skills.check;
  const ask = check?.onAsk;
  if (close === undefined || check === undefined || ask === undefined) return skills;
  return {
    ...skills,
    check: {
      ...check,
      onAsk: () => {
        ask();
        close();
      },
    },
  };
}

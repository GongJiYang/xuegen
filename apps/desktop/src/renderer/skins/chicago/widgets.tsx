/**
 * Chicago widgets shared by the F2 panels.
 *
 * The small controls the design's tool windows are built from: a labelled count
 * line, a 1px-framed progress bar, an inset field, a radio group, a tag, and a
 * section caption. They carry the design's class names only; colours come from
 * the palette CSS variables.
 */

import type { ReactNode } from "react";

/** A labelled count: label left, Chicago number right (the design's `.count`). */
export function Count({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="chicago-count">
      <span>{label}</span>
      <b>{value}</b>
    </div>
  );
}

/** A square-framed progress bar: ink fill over a 25% dither track. */
export function Bar({ percent }: { percent: number }) {
  const clamped = Math.max(0, Math.min(100, Math.round(percent)));
  return (
    <div className="chicago-bar">
      <i style={{ width: `${clamped}%` }} />
    </div>
  );
}

/** A bar with its percent label, as the progress rows show them. */
export function BarRow({ name, percent }: { name: string; percent: number }) {
  return (
    <div className="chicago-course">
      <span>{name}</span>
      <Bar percent={percent} />
      <span className="chicago-pct">{Math.round(percent)}%</span>
    </div>
  );
}

/** A dotted-box section caption (the design's `.inbox .cap`). */
export function Caption({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="chicago-cap">
      <span>{title}</span>
      {hint && <span className="chicago-small">{hint}</span>}
    </div>
  );
}

/** An inset field (`.field`): 1px frame, paper background, no UA chrome. */
export function Field({
  value,
  onChange,
  placeholder,
  ariaLabel,
  grow,
  block,
  inputRef,
}: {
  value: string;
  onChange(value: string): void;
  placeholder?: string;
  ariaLabel: string;
  grow?: boolean;
  /** Full-width (the design's `width:100%` field), for stacked forms. */
  block?: boolean;
  /** Focus handle, so a command can put the cursor here on open. */
  inputRef?: React.Ref<HTMLInputElement>;
}) {
  return (
    <input
      ref={inputRef}
      className={`chicago-field${grow ? " chicago-grow" : ""}${block ? " chicago-block" : ""}`}
      value={value}
      placeholder={placeholder}
      aria-label={ariaLabel}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}

/** A multi-line field. */
export function Area({
  value,
  onChange,
  placeholder,
  ariaLabel,
  rows,
}: {
  value: string;
  onChange(value: string): void;
  placeholder?: string;
  ariaLabel: string;
  rows?: number;
}) {
  return (
    <textarea
      className="chicago-field chicago-area"
      value={value}
      rows={rows}
      placeholder={placeholder}
      aria-label={ariaLabel}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}

/** A horizontal row of controls, `space-between` when told to spread. */
export function InRow({ children, spread }: { children: ReactNode; spread?: boolean }) {
  return <div className={`chicago-inrow${spread ? " chicago-spread" : ""}`}>{children}</div>;
}

/** A radio group; the design's pixel radio, not the UA control. */
export function RadioGroup<T extends string>({
  name,
  value,
  options,
  onChange,
  label,
}: {
  name: string;
  value: T;
  options: { id: T; label: string }[];
  onChange(value: T): void;
  label?: string;
}) {
  return (
    <div className="chicago-radio">
      {label && <span>{label}</span>}
      {options.map((option) => (
        <label key={option.id}>
          <input
            type="radio"
            name={name}
            value={option.id}
            checked={value === option.id}
            onChange={() => onChange(option.id)}
          />
          {option.label}
        </label>
      ))}
    </div>
  );
}

/** A checkbox with the design's pixel box. */
export function CheckBox({
  checked,
  onChange,
  ariaLabel,
  disabled,
}: {
  checked: boolean;
  onChange?(checked: boolean): void;
  ariaLabel: string;
  disabled?: boolean;
}) {
  return (
    <input
      type="checkbox"
      className="chicago-chk"
      checked={checked}
      disabled={disabled}
      aria-label={ariaLabel}
      onChange={onChange ? (event) => onChange(event.target.checked) : undefined}
    />
  );
}

/** A framed tag; `solid` inverts it (the design's `.tag.solid`). */
export function Tag({ children, solid }: { children: ReactNode; solid?: boolean }) {
  return <span className={`chicago-tag${solid ? " chicago-solid" : ""}`}>{children}</span>;
}

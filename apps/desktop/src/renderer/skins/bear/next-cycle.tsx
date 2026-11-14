/**
 * Bear 开下一周期: the 本周 banner and the five-step wizard (design plan2
 * 第 7、8 屏). The last step hands every answer to 总控; nothing is written here.
 */

import { Dialog as RadixDialog } from "radix-ui";
import type { NextCycleView, NextCycleWizardView } from "../contract.js";
import { strings } from "../../core/strings.js";

const text = strings.nextCycle;

export function NextCycleBanner({ view }: { view: NextCycleView }) {
  if (view.banner === null) return null;
  return (
    <div className="bear-nc-banner">
      <span>{view.banner}</span>
      <button type="button" className="bear-btn-primary" onClick={view.onOpen}>
        {text.open}
      </button>
    </div>
  );
}

export function NextCycleWizard({ view }: { view: NextCycleView }) {
  const wizard = view.wizard;
  return (
    <RadixDialog.Root open={wizard !== null} onOpenChange={(next) => !next && wizard?.onClose()}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="bear-dlg-overlay" />
        <RadixDialog.Content className="bear-dlg bear-nc" aria-describedby={undefined}>
          {wizard !== null && <Steps wizard={wizard} />}
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}

function Steps({ wizard }: { wizard: NextCycleWizardView }) {
  const last = wizard.step === wizard.steps.length - 1;
  return (
    <>
      <RadixDialog.Title className="bear-dlg-title">{wizard.title}</RadixDialog.Title>
      {wizard.meta !== "" && <p className="bear-cp-meta">{wizard.meta}</p>}
      <ol className="bear-nc-steps">
        {wizard.steps.map((step, index) => (
          <li
            key={step}
            className={index === wizard.step ? "is-on" : index < wizard.step ? "is-done" : ""}
            aria-current={index === wizard.step ? "step" : undefined}
          >
            {index + 1} {step}
          </li>
        ))}
      </ol>
      <div className="bear-nc-body">
        {wizard.state === "loading" && <p className="bear-cp-meta">{text.loading}</p>}
        {wizard.error !== null && (
          <p className="bear-cp-meta" role="alert">
            {wizard.error}
          </p>
        )}
        {wizard.state === "ready" && wizard.error === null && <Step wizard={wizard} />}
      </div>
      <div className="bear-nc-btns">
        <button type="button" className="bear-btn" onClick={wizard.onBack}>
          {wizard.step === 0 ? text.cancel : text.back}
        </button>
        <button type="button" className="bear-btn-primary" disabled={!wizard.canNext} onClick={wizard.onNext}>
          {last ? text.submit : text.next}
        </button>
      </div>
    </>
  );
}

function Step({ wizard }: { wizard: NextCycleWizardView }) {
  switch (wizard.step) {
    case 0:
      return <Accept wizard={wizard} />;
    case 1:
      return <Mains wizard={wizard} />;
    case 2:
      return <Materials wizard={wizard} />;
    case 3:
      return <Shelf wizard={wizard} />;
    default:
      return <Preview wizard={wizard} />;
  }
}

function Accept({ wizard }: { wizard: NextCycleWizardView }) {
  const { accept } = wizard;
  return (
    <>
      <p className="bear-cp-caption">{text.acceptCaption}</p>
      <ul className="bear-nc-rows">
        {accept.rows.map((row) => (
          <li key={row.slug}>
            <div className="bear-nc-row">
              <span className={`bear-nc-mark ${row.met ? "is-done" : "is-warn"}`}>{row.met ? "✓" : "!"}</span>
              <b>{row.name}</b>
              <span className="bear-cp-meta">
                {row.lessons} · {row.goalsLine}
              </span>
            </div>
            <ul className="bear-nc-goals">
              {row.goals.map((goal) => (
                <li key={goal.text} className={goal.done ? "is-done" : ""}>
                  {goal.done ? "✓ " : "○ "}
                  {goal.text}
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
      {accept.shortfall !== null && (
        <fieldset className="bear-nc-set">
          <legend className="bear-cp-caption">{text.shortfallCaption}</legend>
          {accept.options.map((option) => (
            <label key={option.value} className="bear-nc-choice">
              <input
                type="radio"
                name="nc-shortfall"
                checked={accept.shortfall === option.value}
                onChange={() => accept.onShortfall(option.value)}
              />
              <span>
                <b>{option.label}</b>
                <small>{option.meta}</small>
              </span>
            </label>
          ))}
        </fieldset>
      )}
    </>
  );
}

function Mains({ wizard }: { wizard: NextCycleWizardView }) {
  const { mains } = wizard;
  return (
    <fieldset className="bear-nc-set">
      <legend className="bear-cp-caption">{mains.caption}</legend>
      {mains.options.length === 0 && <p className="bear-cp-meta">{text.mainsNone}</p>}
      {mains.options.map((option) => (
        <label key={option.slug} className={`bear-nc-choice${option.disabled ? " is-off" : ""}`}>
          <input
            type="checkbox"
            checked={option.checked}
            disabled={option.disabled}
            onChange={() => mains.onToggle(option.slug)}
          />
          <span>
            <b>{option.name}</b>
            {option.meta !== "" && <small>{option.meta}</small>}
          </span>
        </label>
      ))}
    </fieldset>
  );
}

function Materials({ wizard }: { wizard: NextCycleWizardView }) {
  return (
    <>
      <p className="bear-cp-caption">{text.materialsCaption}</p>
      {wizard.materials.groups.map((group) => (
        <fieldset key={group.slug} className="bear-nc-set">
          <legend className="bear-nc-subject">{group.name}</legend>
          {group.options.length === 0 && <p className="bear-cp-meta">{text.materialsNone}</p>}
          {group.options.map((option) => (
            <label key={option.title} className="bear-nc-choice">
              <input
                type="radio"
                name={`nc-material-${group.slug}`}
                checked={group.picked === option.title}
                onChange={() => group.onPick(option.title)}
              />
              <span>
                <b>{option.title}</b>
                {option.meta !== "" && <small>{option.meta}</small>}
              </span>
            </label>
          ))}
          {group.from !== null && (
            <div className="bear-nc-from" role="radiogroup" aria-label={`${group.name} ${text.fromCaption}`}>
              <span className="bear-cp-meta">{text.fromCaption}</span>
              {(["continue", "fresh"] as const).map((value) => (
                <label key={value}>
                  <input
                    type="radio"
                    name={`nc-from-${group.slug}`}
                    checked={group.from === value}
                    onChange={() => group.onFrom(value)}
                  />{" "}
                  {value === "continue" ? text.fromContinue : text.fromFresh}
                </label>
              ))}
            </div>
          )}
        </fieldset>
      ))}
    </>
  );
}

function Shelf({ wizard }: { wizard: NextCycleWizardView }) {
  const { shelf } = wizard;
  return (
    <fieldset className="bear-nc-set">
      <legend className="bear-cp-caption">{text.shelfCaption}</legend>
      {shelf.options.length === 0 && <p className="bear-cp-meta">{text.shelfNone}</p>}
      <div className="bear-nc-scroll">
        {shelf.options.map((option) => (
          <label key={option.key} className="bear-nc-choice">
            <input type="checkbox" checked={option.checked} onChange={() => shelf.onToggle(option.key)} />
            <span>
              <b>{option.title}</b>
              {option.meta !== "" && <small>{option.meta}</small>}
            </span>
          </label>
        ))}
      </div>
      <p className="bear-cp-meta bear-nc-note">{shelf.note}</p>
    </fieldset>
  );
}

function Preview({ wizard }: { wizard: NextCycleWizardView }) {
  const { preview } = wizard;
  return (
    <>
      <p className="bear-cp-caption">{preview.caption}</p>
      {preview.state === "loading" && <p className="bear-cp-meta">{text.loading}</p>}
      {preview.state === "error" && (
        <p className="bear-cp-meta" role="alert">
          {text.failed}
        </p>
      )}
      {preview.state === "ready" && (
        <ol className="bear-nc-week">
          {preview.cells.map((cell) => (
            <li key={cell.date} className={cell.deep ? "is-deep" : ""}>
              <b>{cell.label}</b>
              <span>{cell.main}</span>
              {cell.aux !== null && <small>{cell.aux}</small>}
            </li>
          ))}
        </ol>
      )}
      <p className="bear-cp-meta bear-nc-note">{text.previewNote}</p>
    </>
  );
}

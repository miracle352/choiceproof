import { diffWordsWithSpace } from "diff";

export type SplitLensState = "sample" | "recorded" | "loading" | "held" | "changed" | "failed";

type SplitLensProps = {
  state: SplitLensState;
  originalInput: string;
  challengedInput: string;
  originalAnswer?: string;
  challengedAnswer?: string;
  compact?: boolean;
};

function changedFragments(before: string, after: string) {
  const parts = diffWordsWithSpace(before, after);
  return {
    before: parts.filter((part) => part.removed).map((part) => part.value.trim()).filter(Boolean).join(" ") || "No text removed",
    after: parts.filter((part) => part.added).map((part) => part.value.trim()).filter(Boolean).join(" ") || "No text added",
  };
}

const STATE_COPY: Record<SplitLensState, string> = {
  sample: "Illustrative sample",
  recorded: "Recorded comparison",
  loading: "Waiting for SERV",
  held: "Answer held",
  changed: "Answer changed",
  failed: "Run failed",
};

export function SplitLens({ state, originalInput, challengedInput, originalAnswer, challengedAnswer, compact = false }: SplitLensProps) {
  const fact = changedFragments(originalInput, challengedInput);
  const leftAnswer = state === "loading" ? originalAnswer ?? "Pending" : originalAnswer ?? "Original";
  const rightAnswer = state === "loading" ? "Waiting" : state === "failed" ? "Unavailable" : challengedAnswer ?? "Changed";

  return (
    <figure className={`split-lens split-lens-${state}${compact ? " split-lens-compact" : ""}`} aria-label={`${STATE_COPY[state]}. Original answer ${leftAnswer}. Challenged answer ${rightAnswer}.`}>
      <div className="lens-stage" aria-hidden="true">
        <div className="lens-beam lens-beam-left" />
        <div className="lens-beam lens-beam-right" />
        <div className="lens-housing">
          <span className="lens-glass lens-glass-left" />
          <span className="lens-aperture" />
          <span className="lens-glass lens-glass-right" />
        </div>
        <div className="lens-answer lens-answer-left"><small>ORIGINAL</small><strong>{leftAnswer}</strong></div>
        <div className="lens-answer lens-answer-right"><small>CHANGED FACT</small><strong>{rightAnswer}</strong></div>
      </div>
      <figcaption className="lens-fact">
        <span>{STATE_COPY[state]}</span>
        <div><del>{fact.before}</del><i aria-hidden="true">→</i><ins>{fact.after}</ins></div>
      </figcaption>
    </figure>
  );
}

import { diffWordsWithSpace } from "diff";

type ComparisonPlateProps = {
  label: "SAMPLE" | "RECORDED" | "LIVE";
  question: string;
  answers: string[];
  originalInput: string;
  challengeInput: string;
  originalAnswer: string;
  challengedAnswer: string;
  challengeKind?: string;
  timestamp?: string;
  models?: { original: string; challenged: string };
};

export function ComparisonPlate(props: ComparisonPlateProps) {
  const changes = diffWordsWithSpace(props.originalInput, props.challengeInput);
  const changed = props.originalAnswer !== props.challengedAnswer;
  const editSize = changes.reduce((total, part) => total + ((part.added || part.removed) ? Array.from(part.value).length : 0), 0);
  const removed = changes.filter((part) => part.removed).map((part) => part.value.trim()).filter(Boolean).join(" ") || "No removed text";
  const added = changes.filter((part) => part.added).map((part) => part.value.trim()).filter(Boolean).join(" ") || "No added text";
  return (
    <article className={`public-comparison ${changed ? "comparison-flipped" : "comparison-held"}`}>
      <header className="public-comparison-header">
        <div><span className={`run-tag tag-${props.label.toLowerCase()}`}>{props.label}</span>{props.timestamp && <time dateTime={props.timestamp}>{new Date(props.timestamp).toLocaleString()}</time>}</div>
        <p>{props.question}</p>
        <small>Allowed: {props.answers.join(" / ")}</small>
      </header>
      <div className="public-comparison-grid">
        <section className="public-verdict public-verdict-original"><span>ORIGINAL SERV ANSWER</span><strong>{props.originalAnswer}</strong>{props.models && <em>{props.models.original}</em>}</section>
        <div className="public-seam">
          <span>ONE CHANGED FACT / {editSize} EDITED CHARACTERS</span>
          <div className="fact-change"><del>{removed}</del><i aria-hidden="true">→</i><ins>{added}</ins></div>
          <strong>{changed ? "ANSWER CHANGED" : "ANSWER HELD"}</strong>
          {props.challengeKind && <small>{props.challengeKind.replaceAll("_", " ")}</small>}
        </div>
        <section className="public-verdict public-verdict-challenged"><span>CHALLENGED SERV ANSWER</span><strong>{props.challengedAnswer}</strong>{props.models && <em>{props.models.challenged}</em>}</section>
      </div>
      <details className="comparison-full-text">
        <summary>Read the complete inputs and exact diff</summary>
        <div className="comparison-input-pair"><section><span>ORIGINAL INPUT</span><p>{props.originalInput}</p></section><section><span>CHALLENGED INPUT</span><p>{props.challengeInput}</p></section></div>
        <div className="diff-text" aria-label={`Exact text difference, ${editSize} edited characters`}>{changes.map((part, index) => <mark className={part.added ? "diff-add" : part.removed ? "diff-remove" : undefined} key={index}>{part.value}</mark>)}</div>
      </details>
    </article>
  );
}

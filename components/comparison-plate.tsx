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
  return (
    <article className={`public-comparison ${changed ? "comparison-flipped" : "comparison-held"}`}>
      <header className="public-comparison-header">
        <div><span className={`run-tag tag-${props.label.toLowerCase()}`}>{props.label}</span>{props.timestamp && <time dateTime={props.timestamp}>{new Date(props.timestamp).toLocaleString()}</time>}</div>
        <p>{props.question}</p>
        <small>Allowed: {props.answers.join(" · ")}</small>
      </header>
      <div className="public-comparison-grid">
        <section>
          <span>ORIGINAL INPUT</span>
          <p>{props.originalInput}</p>
          <div><small>SERV ANSWER</small><strong>{props.originalAnswer}</strong>{props.models && <em>{props.models.original}</em>}</div>
        </section>
        <div className="public-seam">
          <span>EXACT EDIT · {editSize} CHARACTERS</span>
          <p>{changes.map((part, index) => <mark className={part.added ? "diff-add" : part.removed ? "diff-remove" : undefined} key={index}>{part.value}</mark>)}</p>
          <strong>{changed ? "ANSWER CHANGED" : "ANSWER HELD"}</strong>
          {props.challengeKind && <small>{props.challengeKind.replaceAll("_", " ")}</small>}
        </div>
        <section>
          <span>CHANGED INPUT</span>
          <p>{props.challengeInput}</p>
          <div><small>SERV ANSWER</small><strong>{props.challengedAnswer}</strong>{props.models && <em>{props.models.challenged}</em>}</div>
        </section>
      </div>
    </article>
  );
}

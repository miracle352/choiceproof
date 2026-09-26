import { notFound } from "next/navigation";
import Link from "next/link";
import { diffWordsWithSpace } from "diff";
import { getPublishedResult } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function SharedResult({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[A-Za-z0-9_-]{24}$/.test(id)) notFound();
  const result = await getPublishedResult(id).catch(() => null);
  if (!result) notFound();
  const item = result.payload;
  const changes = diffWordsWithSpace(item.originalInput, item.challengeInput);
  return <main className="share-page">
    <header className="share-header"><Link className="brand" href="/"><span className="brand-mark" aria-hidden="true" /><span>CHOICEPROOF</span></Link><span>Published result · expires {new Date(result.expiresAt).toLocaleDateString()}</span></header>
    <article className="share-sheet">
      <p className="eyebrow">OWNER-PUBLISHED CASE</p><h1>{item.question}</h1>
      <p className="share-choice-list">Allowed answers: {item.answers.join(" · ")}</p>
      <div className="answer-comparison"><div><small>ORIGINAL</small><strong>{item.original.selectedAnswer}</strong></div><span aria-hidden="true">→</span><div><small>CHALLENGED</small><strong>{item.challenged.selectedAnswer}</strong></div><p>{item.classification.replaceAll("_", " ")}</p></div>
      <div className="diff-block"><div className="diff-heading"><span>Exact input difference</span><strong>{item.challengeKind.replaceAll("_", " ")}</strong></div><div className="diff-text">{changes.map((part, index) => <span className={part.added ? "diff-add" : part.removed ? "diff-remove" : undefined} key={index}>{part.value}</span>)}</div></div>
      <dl className="share-meta"><div><dt>Expected</dt><dd>{item.expectedAnswer}</dd></div><div><dt>Same meaning</dt><dd>{item.meaningPreserved ? "Yes" : "No"}</dd></div><div><dt>Model</dt><dd>{item.challenged.model}</dd></div><div><dt>Provider</dt><dd>{item.challenged.provider ?? "Not returned"}</dd></div></dl>
      <p className="privacy-note">This result was explicitly published by its anonymous owner. Raw provider responses and browser ownership data are not public.</p>
    </article>
  </main>;
}

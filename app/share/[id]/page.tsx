import { notFound } from "next/navigation";
import Link from "next/link";
import { diffWordsWithSpace } from "diff";
import { PublicRerun } from "@/components/public-rerun";
import { SiteFooter, SiteHeader } from "@/components/site-header";
import { getPublishedResult } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function SharedResult({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[A-Za-z0-9_-]{24}$/.test(id)) notFound();
  const result = await getPublishedResult(id).catch(() => null);
  if (!result) notFound();
  const item = result.payload;
  const changes = diffWordsWithSpace(item.originalInput, item.challengeInput);
  return <><SiteHeader /><main id="main-content" className="share-page">
    <header className="share-header"><Link href="/evidence">← Public evidence</Link><span>Published {new Date(result.createdAt).toLocaleString()} · expires {new Date(result.expiresAt).toLocaleDateString()}</span></header>
    <article className="share-sheet">
      <p className="eyebrow">RECORDED / OWNER-PUBLISHED CASE</p><h1>{item.question}</h1>
      <p className="share-choice-list">Allowed answers: {item.answers.join(" · ")}</p>
      <div className="answer-comparison"><div><small>ORIGINAL</small><strong>{item.original.selectedAnswer}</strong></div><span aria-hidden="true">→</span><div><small>CHALLENGED</small><strong>{item.challenged.selectedAnswer}</strong></div><p>{item.classification.replaceAll("_", " ")}</p></div>
      <div className="published-inputs"><section><span>ORIGINAL INPUT</span><p>{item.originalInput}</p></section><section><span>CHANGED INPUT</span><p>{item.challengeInput}</p></section></div>
      <div className="diff-block"><div className="diff-heading"><span>Exact input difference</span><strong>{item.challengeKind.replaceAll("_", " ")}</strong></div><div className="diff-text">{changes.map((part, index) => <span className={part.added ? "diff-add" : part.removed ? "diff-remove" : undefined} key={index}>{part.value}</span>)}</div></div>
      <dl className="share-meta"><div><dt>Expected</dt><dd>{item.expectedAnswer}</dd></div><div><dt>Challenge intent</dt><dd>{item.challengeIntent ?? (item.meaningPreserved ? "preserve" : "change")}</dd></div><div><dt>Original model</dt><dd>{item.original.model}</dd></div><div><dt>Changed model</dt><dd>{item.challenged.model}</dd></div><div><dt>Original recorded</dt><dd>{item.recordedAt?.original ? new Date(item.recordedAt.original).toLocaleString() : "Unavailable in legacy record"}</dd></div><div><dt>Changed recorded</dt><dd>{item.recordedAt?.challenged ? new Date(item.recordedAt.challenged).toLocaleString() : "Unavailable in legacy record"}</dd></div><div><dt>Original provider</dt><dd>{item.original.provider ?? "Not returned"}</dd></div><div><dt>Changed provider</dt><dd>{item.challenged.provider ?? "Not returned"}</dd></div></dl>
      <section className="published-jev" aria-label="Jev analysis"><div><span>JEV ANALYSIS</span><b>{item.jev ? "RECORDED" : "UNAVAILABLE"}</b></div>{item.jev ? <dl><div><dt>Observed</dt><dd>{item.jev.observedBehavior}</dd></div><div><dt>Apparent relevance</dt><dd>{item.jev.apparentRelevance.replaceAll("_", " ")}</dd></div><div><dt>Review priority</dt><dd>{item.jev.reviewPriority}</dd></div><div><dt>Model</dt><dd>{item.jev.model}</dd></div></dl> : <p>No persisted Jev analysis was available when this case was published. SERV’s recorded answers remain valid evidence.</p>}</section>
      <p className="privacy-note">This result was explicitly published by its anonymous owner. Raw provider responses and browser ownership data are not public.</p>
    </article>
    <PublicRerun payload={item} />
  </main><SiteFooter /></>;
}

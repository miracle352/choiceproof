import { notFound } from "next/navigation";
import Link from "next/link";
import { PublicRerun } from "@/components/public-rerun";
import { SiteFooter, SiteHeader } from "@/components/site-header";
import { ComparisonPlate } from "@/components/comparison-plate";
import { SplitLens } from "@/components/split-lens";
import { ArrowLeftIcon } from "@/components/icons";
import { getPublishedResult } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function SharedResult({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[A-Za-z0-9_-]{24}$/.test(id)) notFound();
  const result = await getPublishedResult(id).catch(() => null);
  if (!result) notFound();
  const item = result.payload;
  return <><SiteHeader /><main id="main-content" className="share-page">
    <header className="share-header"><Link href="/evidence"><ArrowLeftIcon /> Public evidence</Link><span>Published {new Date(result.createdAt).toLocaleString()} / expires {new Date(result.expiresAt).toLocaleDateString()}</span></header>
    <article className="share-sheet">
      <p className="eyebrow">OWNER-PUBLISHED CASE</p><h1>{item.question}</h1>
      <p className="share-choice-list">Allowed answers: {item.answers.join(" / ")}</p>
      <SplitLens state={item.original.selectedAnswer === item.challenged.selectedAnswer ? "held" : "changed"} originalInput={item.originalInput} challengedInput={item.challengeInput} originalAnswer={item.original.selectedAnswer} challengedAnswer={item.challenged.selectedAnswer} compact />
      <ComparisonPlate label="RECORDED" question={item.question} answers={item.answers} originalInput={item.originalInput} challengeInput={item.challengeInput} originalAnswer={item.original.selectedAnswer} challengedAnswer={item.challenged.selectedAnswer} challengeKind={item.challengeKind} timestamp={item.recordedAt?.challenged} models={{ original: item.original.model, challenged: item.challenged.model }} />
      <dl className="share-meta"><div><dt>Expected</dt><dd>{item.expectedAnswer}</dd></div><div><dt>Challenge intent</dt><dd>{item.challengeIntent ?? (item.meaningPreserved ? "preserve" : "change")}</dd></div><div><dt>Original model</dt><dd>{item.original.model}</dd></div><div><dt>Changed model</dt><dd>{item.challenged.model}</dd></div><div><dt>Original recorded</dt><dd>{item.recordedAt?.original ? new Date(item.recordedAt.original).toLocaleString() : "Unavailable in legacy record"}</dd></div><div><dt>Changed recorded</dt><dd>{item.recordedAt?.challenged ? new Date(item.recordedAt.challenged).toLocaleString() : "Unavailable in legacy record"}</dd></div><div><dt>Original provider</dt><dd>{item.original.provider ?? "Not returned"}</dd></div><div><dt>Changed provider</dt><dd>{item.challenged.provider ?? "Not returned"}</dd></div></dl>
      <section className="published-jev" aria-label="Jev analysis"><div><span>JEV ANALYSIS</span><b>{item.jev ? "RECORDED" : "UNAVAILABLE"}</b></div>{item.jev ? <dl><div><dt>Observed</dt><dd>{item.jev.observedBehavior}</dd></div><div><dt>Apparent relevance</dt><dd>{item.jev.apparentRelevance.replaceAll("_", " ")}</dd></div><div><dt>Review priority</dt><dd>{item.jev.reviewPriority}</dd></div><div><dt>Model</dt><dd>{item.jev.model}</dd></div></dl> : <p>No persisted Jev analysis was available when this case was published. SERV’s recorded answers remain valid evidence.</p>}</section>
      <p className="privacy-note">This result was explicitly published by its anonymous owner. Raw provider responses and browser ownership data are not public.</p>
    </article>
    <PublicRerun payload={item} />
  </main><SiteFooter /></>;
}

import Link from "next/link";
import { connection } from "next/server";
import { ComparisonPlate } from "@/components/comparison-plate";
import { SplitLens } from "@/components/split-lens";
import { LandingLiveExample } from "@/components/landing-live-example";
import { SiteFooter, SiteHeader } from "@/components/site-header";
import { listPublishedResults } from "@/lib/db";
import { REFUND_CHALLENGE, REFUND_EXAMPLE, REFUND_SAMPLE_ANSWERS } from "@/lib/example";
import { isServConfigured } from "@/lib/serv";

export default async function Home() {
  await connection();
  const recorded = (await listPublishedResults(1).catch(() => []))[0] ?? null;
  const hero = recorded?.payload;
  const heroOriginalInput = hero?.originalInput ?? REFUND_EXAMPLE.input;
  const heroChallengeInput = hero?.challengeInput ?? REFUND_CHALLENGE;
  const heroOriginalAnswer = hero?.original.selectedAnswer ?? REFUND_SAMPLE_ANSWERS.original;
  const heroChallengedAnswer = hero?.challenged.selectedAnswer ?? REFUND_SAMPLE_ANSWERS.challenged;

  return (
    <>
      <SiteHeader />
      <main id="main-content" className="landing-page">
        <section className="landing-hero" aria-labelledby="landing-title">
          <div className="landing-copy">
            <p className="eyebrow">THE SPLIT LENS</p>
            <h1 id="landing-title">See where one fact <em>moves the decision.</em></h1>
            <p className="landing-deck">Compare one controlled edit, inspect SERV&apos;s bounded answers, and preserve the human-reviewed evidence.</p>
            <div className="landing-actions">
              <Link className="primary-button" href="/chamber">Test a decision <span aria-hidden="true">↗</span></Link>
              <Link className="quiet-link" href="/evidence">Explore the evidence</Link>
            </div>
          </div>
          <div className="hero-orbit">
            <SplitLens state={recorded ? "recorded" : "sample"} originalInput={heroOriginalInput} challengedInput={heroChallengeInput} originalAnswer={heroOriginalAnswer} challengedAnswer={heroChallengedAnswer} />
            <p className="hero-provenance">{recorded ? <>RECORDED {hero?.recordedAt?.challenged ? new Date(hero.recordedAt.challenged).toLocaleString() : "timestamp unavailable"} / {hero?.challenged.model}</> : <>SAMPLE / illustrative values / no API call</>}</p>
          </div>
        </section>

        <section className="landing-example" id="example" aria-labelledby="example-title">
          <header className="editorial-heading">
            <p className="eyebrow">{recorded ? "PUBLISHED EVIDENCE" : "WORKED EXAMPLE"}</p>
            <h2 id="example-title">One changed fact. Two bounded answers. One human judgment.</h2>
            <p>{recorded ? "An owner explicitly published this complete SERV comparison." : "A one-variable refund example, clearly marked as illustrative."}</p>
          </header>
          {recorded ? (
            <ComparisonPlate label="RECORDED" question={recorded.payload.question} answers={recorded.payload.answers} originalInput={recorded.payload.originalInput} challengeInput={recorded.payload.challengeInput} originalAnswer={recorded.payload.original.selectedAnswer} challengedAnswer={recorded.payload.challenged.selectedAnswer} challengeKind={recorded.payload.challengeKind} timestamp={recorded.payload.recordedAt?.challenged} models={{ original: recorded.payload.original.model, challenged: recorded.payload.challenged.model }} />
          ) : (
            <ComparisonPlate label="SAMPLE" question={REFUND_EXAMPLE.question} answers={REFUND_EXAMPLE.answers} originalInput={REFUND_EXAMPLE.input} challengeInput={REFUND_CHALLENGE} originalAnswer={REFUND_SAMPLE_ANSWERS.original} challengedAnswer={REFUND_SAMPLE_ANSWERS.challenged} challengeKind="one controlled fact" />
          )}
          <LandingLiveExample servConfigured={isServConfigured()} />
          {recorded && <Link className="evidence-detail-link" href={`/share/${recorded.id}`}>Open the complete recorded case <span aria-hidden="true">→</span></Link>}
        </section>

        <section className="how-it-works" id="how-it-works" aria-labelledby="how-title">
          <div className="editorial-heading"><p className="eyebrow">CLEAR RESPONSIBILITY</p><h2 id="how-title">Four roles. No invented certainty.</h2><p>A changed answer stays an observation until a person labels what should have happened.</p></div>
          <ol>
            <li><strong>SERV decides</strong><p>It must select exactly one configured answer. Anything else is FAILED.</p></li>
            <li><strong>Jev analyzes</strong><p>It can assess the experiment&apos;s hold or flip, apparent edit relevance, and review priority.</p></li>
            <li><strong>A human labels</strong><p>The reviewer confirms the expected answer and the edit&apos;s intended effect.</p></li>
            <li><strong>Code keeps proof</strong><p>Choiceproof validates, stores, publishes by consent, and reruns cases against revisions.</p></li>
          </ol>
        </section>

        <section className="landing-close"><p className="eyebrow">PRIVATE BY DEFAULT</p><h2>Test a boundary in under a minute. Keep the cases that matter.</h2><Link className="primary-button" href="/chamber">Test a decision <span aria-hidden="true">↗</span></Link></section>
      </main>
      <SiteFooter />
    </>
  );
}

import Link from "next/link";
import { connection } from "next/server";
import { ComparisonPlate } from "@/components/comparison-plate";
import { DecisionPathScene } from "@/components/decision-path-scene";
import { LandingLiveExample } from "@/components/landing-live-example";
import { SiteFooter, SiteHeader } from "@/components/site-header";
import { listPublishedResults } from "@/lib/db";
import { REFUND_CHALLENGE, REFUND_EXAMPLE, REFUND_SAMPLE_ANSWERS } from "@/lib/example";
import { isServConfigured } from "@/lib/serv";

export default async function Home() {
  await connection();
  const recorded = (await listPublishedResults(1).catch(() => []))[0] ?? null;

  return (
    <>
      <SiteHeader />
      <main id="main-content" className="landing-page">
        <section className="landing-hero" aria-labelledby="landing-title">
          <div className="landing-copy">
            <p className="eyebrow">BOUNDED DECISION TESTING / OPENServ SERV REASONING</p>
            <h1 id="landing-title">One sentence can move an AI decision. <em>Choiceproof shows exactly where.</em></h1>
            <p className="landing-deck">Run the same bounded decision across a controlled edit, inspect both real outputs, and turn human-reviewed failures into regression evidence.</p>
            <div className="landing-actions">
              <Link className="primary-button" href="/chamber">Enter the Chamber <span aria-hidden="true">↗</span></Link>
              <a className="quiet-link" href="#example">See the comparison</a>
            </div>
          </div>
          <div className="hero-orbit"><DecisionPathScene state="sample" originalAnswer="Original" challengedAnswer="Changed" /></div>
        </section>

        <section className="landing-example" id="example" aria-labelledby="example-title">
          <header className="editorial-heading">
            <div><p className="eyebrow">{recorded ? "PUBLISHED EVIDENCE" : "WORKED EXAMPLE"}</p><h2 id="example-title">The decision boundary, made visible.</h2></div>
            <p>{recorded ? "An owner explicitly published this complete, recorded SERV comparison." : "An illustrative, one-variable refund example. No API call or measured metadata is implied."}</p>
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
          <div className="editorial-heading"><div><p className="eyebrow">CLEAR RESPONSIBILITY</p><h2 id="how-title">Four roles. No invented certainty.</h2></div><p>A changed answer is an observation until a person labels what should have happened.</p></div>
          <ol>
            <li><span>01</span><strong>SERV decides</strong><p>It must select exactly one configured answer. Anything else is FAILED.</p></li>
            <li><span>02</span><strong>Jev analyzes</strong><p>It can assess the experiment’s hold or flip, apparent edit relevance, and review priority.</p></li>
            <li><span>03</span><strong>A human labels</strong><p>The reviewer confirms the expected answer and whether the edit should preserve the decision.</p></li>
            <li><span>04</span><strong>Code keeps proof</strong><p>Choiceproof validates, stores, publishes by consent, and reruns cases against revisions.</p></li>
          </ol>
        </section>

        <section className="landing-close"><p className="eyebrow">PRIVATE BY DEFAULT</p><h2>Test a boundary in under a minute. Keep the cases that matter.</h2><Link className="primary-button" href="/chamber">Test a decision <span aria-hidden="true">↗</span></Link></section>
      </main>
      <SiteFooter />
    </>
  );
}

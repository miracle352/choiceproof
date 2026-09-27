import Link from "next/link";
import { connection } from "next/server";
import { diffWordsWithSpace } from "diff";
import { ComparisonPlate } from "@/components/comparison-plate";
import { LandingLiveExample } from "@/components/landing-live-example";
import { OrbStory } from "@/components/orb-story";
import { SiteFooter, SiteHeader } from "@/components/site-header";
import { listPublishedResults } from "@/lib/db";
import { REFUND_CHALLENGE, REFUND_EXAMPLE, REFUND_SAMPLE_ANSWERS } from "@/lib/example";
import { isServConfigured } from "@/lib/serv";

function controlledFacts(before: string, after: string) {
  const parts = diffWordsWithSpace(before, after);
  let original = parts.filter((part) => part.removed).map((part) => part.value.trim()).filter(Boolean).join(" ");
  let changed = parts.filter((part) => part.added).map((part) => part.value.trim()).filter(Boolean).join(" ");
  const lastChange = parts.reduce((index, part, partIndex) => part.added || part.removed ? partIndex : index, -1);
  const followingWord = parts.slice(lastChange + 1).find((part) => !part.added && !part.removed)?.value.trim().split(/\s+/)[0];
  if (/^\d+$/.test(original) && /^\d+$/.test(changed) && followingWord) {
    original = `${original} ${followingWord}`;
    changed = `${changed} ${followingWord}`;
  }
  return { original, changed };
}

export default async function Home() {
  await connection();
  const published = await listPublishedResults(12).catch(() => []);
  const recorded = published[0] ?? null;
  const heroRecord = published.find((item) => {
    const fact = controlledFacts(item.payload.originalInput, item.payload.challengeInput);
    return Boolean(fact.original && fact.changed && fact.original.length <= 32 && fact.changed.length <= 32);
  }) ?? null;
  const hero = heroRecord?.payload;
  const heroOriginalInput = hero?.originalInput ?? REFUND_EXAMPLE.input;
  const heroChallengeInput = hero?.challengeInput ?? REFUND_CHALLENGE;
  const heroFacts = controlledFacts(heroOriginalInput, heroChallengeInput);
  const heroOriginalAnswer = hero?.original.selectedAnswer ?? REFUND_SAMPLE_ANSWERS.original;
  const heroChallengedAnswer = hero?.challenged.selectedAnswer ?? REFUND_SAMPLE_ANSWERS.challenged;
  const heroProvenance = heroRecord
    ? `${hero?.recordedAt?.challenged ? new Date(hero.recordedAt.challenged).toLocaleString() : "Timestamp unavailable"} / ${hero?.challenged.model}`
    : "Illustrative values / no API call";

  return (
    <>
      <SiteHeader />
      <main id="main-content" className="landing-page">
        <OrbStory
          mode={heroRecord ? "recorded" : "sample"}
          originalFact={heroFacts.original || "Original evidence"}
          changedFact={heroFacts.changed || "Changed evidence"}
          originalAnswer={heroOriginalAnswer}
          challengedAnswer={heroChallengedAnswer}
          provenance={heroProvenance}
        >
          <div className="landing-copy">
            <h1 id="landing-title">One sentence.<br /><span>Two decisions.</span></h1>
            <p className="landing-deck">Change one fact. See where SERV draws the line.</p>
            <div className="landing-actions">
              <Link className="primary-button" href="/chamber">Enter the Chamber <span aria-hidden="true">↗</span></Link>
              <Link className="quiet-link" href="/evidence">Explore the evidence</Link>
            </div>
          </div>
        </OrbStory>

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

import Link from "next/link";
import { connection } from "next/server";
import { SiteFooter, SiteHeader } from "@/components/site-header";
import { listPublishedResults } from "@/lib/db";

export default async function EvidencePage() {
  await connection();
  const evidence = await listPublishedResults().catch(() => []);
  return (
    <>
      <SiteHeader />
      <main id="main-content" className="evidence-page">
        <header className="evidence-hero">
          <p className="eyebrow">PUBLIC / OWNER-PUBLISHED</p>
          <h1>Evidence, with a publication boundary.</h1>
          <p>Only cases an owner deliberately published appear here. Private and held-out cases are excluded. Recorded results are preserved even when a later rerun disagrees.</p>
          <div className="evidence-count"><strong>{evidence.length}</strong><span>active published {evidence.length === 1 ? "case" : "cases"}</span></div>
        </header>
        {evidence.length ? <section className="evidence-list" aria-label="Published evidence">
          {evidence.map((item, index) => {
            const changed = item.payload.original.selectedAnswer !== item.payload.challenged.selectedAnswer;
            return <Link className="evidence-card" href={`/share/${item.id}`} key={item.id}>
              <span className="evidence-index">{String(index + 1).padStart(2, "0")}</span>
              <div><span className="run-tag tag-recorded">RECORDED</span><h2>{item.payload.question}</h2><p>{item.payload.challengeKind.replaceAll("_", " ")} · published {new Date(item.createdAt).toLocaleDateString()}</p></div>
              <div className="evidence-verdict"><span>{item.payload.original.selectedAnswer}</span><i aria-hidden="true">→</i><span>{item.payload.challenged.selectedAnswer}</span><strong className={changed ? "is-change" : "is-hold"}>{changed ? "ANSWER CHANGED" : "ANSWER HELD"}</strong></div>
            </Link>;
          })}
        </section> : <section className="evidence-empty"><span>NO PUBLIC CASES YET</span><h2>Private evidence stays private.</h2><p>The gallery will populate only after an owner saves a non-held-out case, previews its contents, and explicitly publishes it.</p><Link className="primary-button" href="/chamber">Create a case <span aria-hidden="true">↗</span></Link></section>}
      </main>
      <SiteFooter />
    </>
  );
}

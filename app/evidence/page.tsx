import Link from "next/link";
import { connection } from "next/server";
import { SiteFooter, SiteHeader } from "@/components/site-header";
import { ArrowUpRightIcon } from "@/components/icons";
import { listPublishedResults } from "@/lib/db";
import { diffWordsWithSpace } from "diff";

export default async function EvidencePage() {
  await connection();
  const evidence = await listPublishedResults().catch(() => []);
  return (
    <>
      <SiteHeader />
      <main id="main-content" className="evidence-page">
        <header className="evidence-hero">
          <p className="eyebrow">PUBLIC EVIDENCE</p>
          <h1>A record of where decisions moved.</h1>
          <p>Owner-published cases only. Private and held-out inputs never appear here, and every recorded result remains intact after reruns.</p>
          <div className="evidence-count"><strong>{evidence.length}</strong><span>published {evidence.length === 1 ? "case" : "cases"}</span></div>
        </header>
        {evidence.length ? <section className="evidence-list" aria-label="Published evidence">
          {evidence.map((item) => {
            const changed = item.payload.original.selectedAnswer !== item.payload.challenged.selectedAnswer;
            const changes = diffWordsWithSpace(item.payload.originalInput, item.payload.challengeInput);
            const removed = changes.filter((part) => part.removed).map((part) => part.value.trim()).filter(Boolean).join(" ") || "No text removed";
            const added = changes.filter((part) => part.added).map((part) => part.value.trim()).filter(Boolean).join(" ") || "No text added";
            return <Link className="evidence-card" href={`/share/${item.id}`} key={item.id}>
              <div><span className="run-tag tag-recorded">RECORDED</span><h2>{item.payload.question}</h2><p>{item.payload.challengeKind.replaceAll("_", " ")} / published {new Date(item.createdAt).toLocaleDateString()}</p></div>
              <div className="evidence-fact"><small>EXACT RECORDED EDIT</small><p><del>{removed}</del><span aria-hidden="true">→</span><ins>{added}</ins></p></div>
              <div className="evidence-verdict"><span>{item.payload.original.selectedAnswer}</span><i aria-hidden="true">→</i><span>{item.payload.challenged.selectedAnswer}</span><strong className={changed ? "is-change" : "is-hold"}>{changed ? "ANSWER CHANGED" : "ANSWER HELD"}</strong></div>
            </Link>;
          })}
        </section> : <section className="evidence-empty"><span>NO PUBLIC CASES YET</span><h2>Private evidence stays private.</h2><p>The index appears only after an owner previews and publishes a non-held-out case.</p><Link className="primary-button" href="/chamber">Create a case <ArrowUpRightIcon /></Link></section>}
      </main>
      <SiteFooter />
    </>
  );
}

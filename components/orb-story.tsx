"use client";

import Image from "next/image";
import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";

type OrbStoryProps = {
  children: ReactNode;
  mode: "sample" | "recorded";
  originalFact: string;
  changedFact: string;
  originalAnswer: string;
  challengedAnswer: string;
  provenance: string;
};

type SaveDataNavigator = Navigator & {
  connection?: { saveData?: boolean };
};

export function OrbStory({
  children,
  mode,
  originalFact,
  changedFact,
  originalAnswer,
  challengedAnswer,
  provenance,
}: OrbStoryProps) {
  const storyRef = useRef<HTMLElement>(null);
  const [phase, setPhase] = useState(0);
  const changed = originalAnswer !== challengedAnswer;

  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const saveData = (navigator as SaveDataNavigator).connection?.saveData === true;
    const compact = window.matchMedia("(max-width: 760px)").matches;
    if (saveData && storyRef.current) storyRef.current.dataset.static = "true";

    if (reduced || saveData || compact || !storyRef.current) return;

    const markers = Array.from(storyRef.current.querySelectorAll<HTMLElement>("[data-orb-marker]"));
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setPhase(Number((entry.target as HTMLElement).dataset.orbMarker ?? 0));
          }
        }
      },
      { rootMargin: "-46% 0px -46% 0px", threshold: 0 },
    );

    markers.forEach((marker) => observer.observe(marker));
    return () => observer.disconnect();
  }, []);

  const stateLabel = mode === "recorded" ? "RECORDED" : "SAMPLE";

  return (
    <section
      className="orb-story"
      data-phase={phase}
      data-result={changed ? "changed" : "held"}
      data-static="false"
      ref={storyRef}
      aria-labelledby="landing-title"
    >
      <div className="orb-scene">
        {children}

        <figure
          className="decision-orb"
          aria-label={`${stateLabel} comparison. ${originalFact} produced ${originalAnswer}. ${changedFact} produced ${challengedAnswer}.`}
        >
          <div className="orb-stone" aria-hidden="true" />
          <div className="orb-camera" aria-hidden="true">
            <div className="orb-poster orb-poster-left">
              <Image src="/choiceproof-orb-poster.png" alt="" fill priority sizes="(max-width: 760px) 100vw, 58vw" />
            </div>
            <div className="orb-poster orb-poster-right">
              <Image src="/choiceproof-orb-poster.png" alt="" fill priority sizes="(max-width: 760px) 100vw, 58vw" />
            </div>
            <span className="orb-seam" />
            <span className="orb-path orb-path-original" />
            <span className="orb-path orb-path-changed" />
          </div>

          <div className="orb-fact orb-fact-original">
            <span>ORIGINAL FACT</span>
            <strong>{originalFact}</strong>
          </div>
          <div className="orb-fact orb-fact-changed">
            <span>ONE CONTROLLED EDIT</span>
            <strong>{changedFact}</strong>
          </div>
          <div className="orb-answer orb-answer-original">
            <span>SERV ANSWER</span>
            <strong>{originalAnswer}</strong>
          </div>
          <div className="orb-answer orb-answer-changed">
            <span>SERV ANSWER</span>
            <strong>{challengedAnswer}</strong>
          </div>
          <figcaption className="orb-provenance">
            <b>{stateLabel}</b>
            <span>{provenance}</span>
          </figcaption>
        </figure>

        <div className="orb-next-frame" aria-hidden="true">
          <span>One controlled fact</span>
          <strong>{changed ? "The boundary moved." : "The boundary held."}</strong>
        </div>
      </div>

      <span className="orb-marker orb-marker-start" data-orb-marker="0" aria-hidden="true" />
      <span className="orb-marker orb-marker-fact" data-orb-marker="1" aria-hidden="true" />
      <span className="orb-marker orb-marker-result" data-orb-marker="2" aria-hidden="true" />
    </section>
  );
}

"use client";

import Image from "next/image";
import { useEffect, useRef, useState, type CSSProperties, type PointerEvent } from "react";

export type PathSceneState = "idle" | "stable" | "changed" | "verified" | "failed" | "sample";

type DecisionPathSceneProps = {
  state: PathSceneState;
  originalAnswer?: string;
  challengedAnswer?: string;
};

const STATE_LABELS: Record<PathSceneState, string> = {
  idle: "Awaiting comparison",
  stable: "Paths converge",
  changed: "Answer changed",
  verified: "Verified failure",
  failed: "Run failed",
  sample: "Sample output",
};

export function DecisionPathScene({ state, originalAnswer, challengedAnswer }: DecisionPathSceneProps) {
  const rootRef = useRef<HTMLElement>(null);
  const [videoEnabled, setVideoEnabled] = useState(false);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const coarsePointer = window.matchMedia("(pointer: coarse)").matches;
    const narrowViewport = window.matchMedia("(max-width: 720px)").matches;
    const saveData = "connection" in navigator && Boolean((navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData);
    if (reducedMotion || coarsePointer || narrowViewport || saveData) return;

    const observer = new IntersectionObserver(([entry]) => {
      if (entry?.isIntersecting) {
        setVideoEnabled(true);
        observer.disconnect();
      }
    }, { rootMargin: "180px" });

    observer.observe(root);
    return () => observer.disconnect();
  }, []);

  function handlePointerMove(event: PointerEvent<HTMLElement>) {
    if (!videoEnabled) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width - 0.5) * 2;
    const y = ((event.clientY - rect.top) / rect.height - 0.5) * 2;
    event.currentTarget.style.setProperty("--tilt-x", `${(-y * 2.5).toFixed(2)}deg`);
    event.currentTarget.style.setProperty("--tilt-y", `${(x * 3.5).toFixed(2)}deg`);
  }

  function resetTilt(event: PointerEvent<HTMLElement>) {
    event.currentTarget.style.setProperty("--tilt-x", "0deg");
    event.currentTarget.style.setProperty("--tilt-y", "0deg");
  }

  const accessibleSummary = originalAnswer && challengedAnswer
    ? `${STATE_LABELS[state]}. Original answer: ${originalAnswer}. Challenged answer: ${challengedAnswer}.`
    : STATE_LABELS[state];

  return (
    <figure
      ref={rootRef}
      className={`path-scene path-scene-${state}`}
      style={{ "--tilt-x": "0deg", "--tilt-y": "0deg" } as CSSProperties}
      onPointerMove={handlePointerMove}
      onPointerLeave={resetTilt}
      role="img"
      aria-label={accessibleSummary}
    >
      <div className="path-media" aria-hidden="true">
        {videoEnabled ? (
          <video autoPlay loop muted playsInline preload="none" poster="/faultline-poster.webp">
            <source src="/faultline-paths-1080p.mp4" type="video/mp4" />
          </video>
        ) : (
          <Image src="/faultline-poster.webp" alt="" fill sizes="(max-width: 720px) 100vw, 44vw" loading="lazy" />
        )}
        <div className="path-vignette" />
        <div className="path-origin" />
        <div className="path-branch path-branch-a" />
        <div className="path-branch path-branch-b" />
      </div>

      <figcaption className="path-caption">
        <span>DECISION FIELD / LIVE STATE</span>
        <strong>{STATE_LABELS[state]}</strong>
        <div className="path-answers">
          <span><i />{originalAnswer ?? "Original"}</span>
          <span><i />{challengedAnswer ?? "Challenged"}</span>
        </div>
      </figcaption>
    </figure>
  );
}

import { spawn } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";

const baseUrl = (process.argv[2] || "https://choiceproof.vercel.app").replace(/\/$/, "");
const outputDir = path.resolve(process.argv[3] || ".artifacts/reduced-motion");
const runPersistenceSmoke = process.argv.includes("--save-smoke");
const simulateJevFailure = process.argv.includes("--simulate-jev-failure");
const chromePath = process.env.CHROME_PATH || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      server.close(() => resolve(port));
    });
  });
}

async function waitForJson(url, timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return response.json();
    } catch {
      // Chrome is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

class CdpSession {
  constructor(url) {
    this.sequence = 0;
    this.pending = new Map();
    this.listeners = new Map();
    this.socket = new WebSocket(url);
    this.ready = new Promise((resolve, reject) => {
      this.socket.addEventListener("open", resolve, { once: true });
      this.socket.addEventListener("error", reject, { once: true });
    });
    this.socket.addEventListener("message", (event) => {
      const message = JSON.parse(event.data);
      if (message.id) {
        const pending = this.pending.get(message.id);
        if (!pending) return;
        this.pending.delete(message.id);
        if (message.error) pending.reject(new Error(message.error.message));
        else pending.resolve(message.result);
        return;
      }
      const listeners = this.listeners.get(message.method) || [];
      this.listeners.delete(message.method);
      listeners.forEach((listener) => listener(message.params));
    });
  }

  async send(method, params = {}) {
    await this.ready;
    const id = ++this.sequence;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  waitFor(method, timeoutMs = 15_000) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`Timed out waiting for ${method}`)), timeoutMs);
      const listener = (params) => {
        clearTimeout(timer);
        resolve(params);
      };
      this.listeners.set(method, [...(this.listeners.get(method) || []), listener]);
    });
  }

  close() {
    this.socket.close();
  }
}

async function evaluate(session, expression) {
  const result = await session.send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text || "Browser evaluation failed");
  return result.result.value;
}

async function navigate(session, url) {
  const loaded = session.waitFor("Page.loadEventFired");
  await session.send("Page.navigate", { url });
  await loaded;
  await new Promise((resolve) => setTimeout(resolve, 1200));
}

async function waitForCondition(session, expression, timeoutMs = 35_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await evaluate(session, expression)) return;
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  throw new Error(`Browser condition timed out: ${expression}`);
}

async function screenshot(session, filename) {
  const capture = await session.send("Page.captureScreenshot", { format: "png", fromSurface: true });
  await writeFile(path.join(outputDir, filename), Buffer.from(capture.data, "base64"));
}

async function setViewport(session, width, height, deviceScaleFactor = 1) {
  await session.send("Emulation.setDeviceMetricsOverride", {
    width,
    height,
    deviceScaleFactor,
    mobile: width <= 430,
    screenWidth: width,
    screenHeight: height,
  });
}

const port = await freePort();
const profileDir = await mkdtemp(path.join(os.tmpdir(), "choiceproof-reduced-motion-"));
await mkdir(outputDir, { recursive: true });

const chrome = spawn(chromePath, [
  "--headless=new",
  `--remote-debugging-port=${port}`,
  `--user-data-dir=${profileDir}`,
  "--no-first-run",
  "--no-default-browser-check",
  "about:blank",
], { stdio: "ignore", windowsHide: true });

const evidence = { baseUrl, emulation: "Chrome DevTools Protocol / prefers-reduced-motion: reduce", desktop: {}, mobile: {}, persistenceSmoke: null };
let session;

try {
  await waitForJson(`http://127.0.0.1:${port}/json/version`);
  const targetResponse = await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent(baseUrl)}`, { method: "PUT" });
  const target = await targetResponse.json();
  session = new CdpSession(target.webSocketDebuggerUrl);
  await session.send("Page.enable");
  await session.send("Runtime.enable");
  if (simulateJevFailure) {
    await session.send("Page.addScriptToEvaluateOnNewDocument", {
      source: `(() => {
        const nativeFetch = window.fetch.bind(window);
        window.fetch = async (input, init) => {
          const url = typeof input === 'string' ? input : input?.url || '';
          if (url.includes('/api/analysis')) {
            return new Response(JSON.stringify({ ok: true, analysis: { status: 'failed', code: 'JEV_TIMEOUT', reason: 'Simulated timeout in an isolated browser audit.' } }), {
              status: 200,
              headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
            });
          }
          return nativeFetch(input, init);
        };
      })();`,
    });
  }
  await session.send("Emulation.setEmulatedMedia", {
    media: "screen",
    features: [{ name: "prefers-reduced-motion", value: "reduce" }],
  });

  await setViewport(session, 1440, 1000);
  await navigate(session, `${baseUrl}/`);
  evidence.desktop.home = await evaluate(session, `(() => {
    const cta = document.querySelector('.landing-actions .primary-button');
    const story = document.querySelector('.orb-story');
    const scene = document.querySelector('.orb-scene');
    const markers = [...document.querySelectorAll('.orb-marker')];
    return {
      reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
      mode: story?.querySelector('.orb-provenance b')?.textContent?.trim(),
      headline: document.querySelector('h1')?.textContent?.replace(/\\s+/g, ' ').trim(),
      cta: cta?.textContent?.replace(/\\s+/g, ' ').trim(),
      ctaVisible: Boolean(cta && cta.getBoundingClientRect().width > 0 && cta.getBoundingClientRect().height > 0),
      scenePosition: scene ? getComputedStyle(scene).position : null,
      markersHidden: markers.every((item) => getComputedStyle(item).display === 'none'),
      runningAnimations: document.getAnimations().filter((item) => item.playState === 'running').length,
    };
  })()`);
  evidence.desktop.home.scroll = await evaluate(session, `(async () => {
    window.scrollTo(0, document.documentElement.scrollHeight);
    await new Promise((resolve) => setTimeout(resolve, 80));
    const max = document.documentElement.scrollHeight - innerHeight;
    return { scrollY, max, reachedEnd: max <= 0 || scrollY >= max - 2 };
  })()`);
  await evaluate(session, "window.scrollTo(0, 0)");
  await screenshot(session, "homepage-desktop.png");

  await navigate(session, `${baseUrl}/chamber`);
  await waitForCondition(session, `(() => {
    const button = [...document.querySelectorAll('button')].find((item) => item.textContent.includes('RUN THIS EXAMPLE LIVE'));
    return Boolean(button && !button.disabled);
  })()`);
  await evaluate(session, `(() => {
    const button = [...document.querySelectorAll('button')].find((item) => item.textContent.includes('RUN THIS EXAMPLE LIVE'));
    button.click();
    return true;
  })()`);
  await waitForCondition(session, `(() => {
    const text = document.querySelector('.decision-chamber')?.textContent || '';
    const jev = document.querySelector('.jev-provenance b')?.textContent?.trim();
    return text.includes('LIVE COMPARISON') && (text.includes('ANSWER CHANGED') || text.includes('ANSWER HELD')) && jev !== 'LOADING';
  })()`, 45_000);
  evidence.desktop.chamber = await evaluate(session, `(() => {
    const chamber = document.querySelector('.decision-chamber');
    const seam = document.querySelector('.boundary-seam');
    const verdicts = [...document.querySelectorAll('.result-card header strong')].map((item) => item.textContent.trim());
    return {
      reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
      runState: document.querySelector('.instrument-header .run-tag')?.textContent?.trim(),
      comparisonState: seam?.getAttribute('aria-label'),
      jevState: document.querySelector('.jev-provenance b')?.textContent?.trim(),
      jevDetail: document.querySelector('.jev-strip')?.textContent?.replace(/\\s+/g, ' ').trim(),
      readableText: chamber?.textContent?.includes('ORIGINAL INPUT') && chamber?.textContent?.includes('CHALLENGED INPUT'),
      verdicts,
      runningAnimations: document.getAnimations().filter((item) => item.playState === 'running').length,
    };
  })()`);
  await evaluate(session, "window.scrollTo(0, 0)");
  await screenshot(session, "chamber-live-desktop.png");

  if (runPersistenceSmoke) {
    const before = await evaluate(session, "fetch('/api/workspace', { cache: 'no-store' }).then((response) => response.json())");
    const challengedAnswer = evidence.desktop.chamber.verdicts[1];
    await evaluate(session, `(() => {
      const select = document.querySelector('#expected');
      select.value = ${JSON.stringify(challengedAnswer)};
      select.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    })()`);
    await waitForCondition(session, `(() => {
      const button = [...document.querySelectorAll('button')].find((item) => item.textContent.includes('CONFIRM EXPECTED ANSWER'));
      return Boolean(button && !button.disabled);
    })()`);
    await evaluate(session, `(() => {
      [...document.querySelectorAll('button')].find((item) => item.textContent.includes('CONFIRM EXPECTED ANSWER')).click();
      [...document.querySelectorAll('button')].find((item) => item.textContent.trim() === 'Change decision').click();
      return true;
    })()`);
    await waitForCondition(session, `(() => {
      const button = [...document.querySelectorAll('button')].find((item) => item.textContent.includes('SAVE REVIEWED CASE'));
      return Boolean(button && !button.disabled);
    })()`);
    await evaluate(session, `(() => {
      [...document.querySelectorAll('button')].find((item) => item.textContent.includes('SAVE REVIEWED CASE')).click();
      return true;
    })()`);
    await waitForCondition(session, `(() => document.body.textContent.includes('CASE SAVED'))()`, 25_000);
    const saved = await evaluate(session, "fetch('/api/workspace', { cache: 'no-store' }).then((response) => response.json())");
    const savedCase = saved.workspace.cases.find((item) => item.expectedAnswer === challengedAnswer) || saved.workspace.cases[0];
    await screenshot(session, "chamber-saved-desktop.png");
    await navigate(session, `${baseUrl}/chamber`);
    await waitForCondition(session, `(() => document.body.textContent.includes('private case'))()`);
    const reloaded = await evaluate(session, "fetch('/api/workspace', { cache: 'no-store' }).then((response) => response.json())");
    const renderedAfterReload = await evaluate(session, `document.body.textContent.includes(${JSON.stringify(`${reloaded.workspace.cases.length} private case`)})`);
    evidence.persistenceSmoke = {
      workspaceInitiallyEmpty: before.workspace.cases.length === 0,
      savedCaseId: savedCase?.id || null,
      savedExpectedAnswer: savedCase?.expectedAnswer || null,
      savedIntent: savedCase?.challengeIntent || null,
      renderedAfterReload,
      retrievedAfterReload: Boolean(savedCase && reloaded.workspace.cases.some((item) => item.id === savedCase.id)),
      caseCountAfterReload: reloaded.workspace.cases.length,
    };
  }

  await setViewport(session, 375, 812, 1);
  await new Promise((resolve) => setTimeout(resolve, 250));
  evidence.mobile.chamber = await evaluate(session, `(() => {
    const chamber = document.querySelector('.decision-chamber');
    return {
      reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
      horizontalOverflow: document.documentElement.scrollWidth > innerWidth,
      runState: document.querySelector('.instrument-header .run-tag')?.textContent?.trim(),
      readableText: chamber?.textContent?.includes('ORIGINAL INPUT') && chamber?.textContent?.includes('CHALLENGED INPUT'),
      runningAnimations: document.getAnimations().filter((item) => item.playState === 'running').length,
    };
  })()`);
  await evaluate(session, "window.scrollTo(0, 0)");
  await screenshot(session, "chamber-live-mobile.png");

  await navigate(session, `${baseUrl}/`);
  evidence.mobile.home = await evaluate(session, `(() => {
    const cta = document.querySelector('.landing-actions .primary-button');
    return {
      reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
      mode: document.querySelector('.orb-provenance b')?.textContent?.trim(),
      ctaVisible: Boolean(cta && cta.getBoundingClientRect().width > 0 && cta.getBoundingClientRect().height > 0),
      horizontalOverflow: document.documentElement.scrollWidth > innerWidth,
      markersHidden: [...document.querySelectorAll('.orb-marker')].every((item) => getComputedStyle(item).display === 'none'),
      runningAnimations: document.getAnimations().filter((item) => item.playState === 'running').length,
    };
  })()`);
  await screenshot(session, "homepage-mobile.png");

  await writeFile(path.join(outputDir, "audit.json"), `${JSON.stringify(evidence, null, 2)}\n`);
  console.log(JSON.stringify(evidence, null, 2));
} finally {
  session?.close();
  chrome.kill();
  await new Promise((resolve) => chrome.once("exit", resolve));
  try {
    await rm(profileDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 150 });
  } catch (error) {
    console.warn(`Chrome profile cleanup deferred: ${error instanceof Error ? error.message : String(error)}`);
  }
}

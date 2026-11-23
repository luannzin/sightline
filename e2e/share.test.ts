// End-to-end: a real host and viewer in headless Chromium, with Chromium's fake screen and mic.
// Needs the internet (the public Nostr relays do the signaling) and a Chromium for
// playwright-core: `bunx playwright-core install chromium`, or point CHROMIUM_PATH at one.

import { afterAll, beforeAll, expect, test } from "bun:test";
import { type Browser, chromium, type Page } from "playwright-core";
import { createServer, type ViteDevServer } from "vite";

let server: ViteDevServer;
let browser: Browser;
let url: string;

beforeAll(async () => {
  server = await createServer({ server: { port: 0 }, logLevel: "error" });
  await server.listen();
  url = server.resolvedUrls?.local[0] ?? "";
  browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || undefined,
    // fake-ui skips the screen picker; fake-device gives a test pattern and a beep
    args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"],
  });
});

afterAll(async () => {
  await browser?.close();
  await server?.close();
});

async function open(link = url) {
  const page = await (await browser.newContext()).newPage();
  await page.goto(link);
  return page;
}

async function startHost() {
  const host = await open();
  await host.getByRole("button", { name: "Share your screen" }).click();
  const box = host.locator("input[readonly]");
  await box.waitFor({ timeout: 20_000 });
  return { host, link: await box.inputValue() };
}

/** What the page's player is playing: live track kinds, and whether there's a picture. */
const playing = (page: Page) =>
  page.evaluate(() => {
    const video = document.querySelector("video");
    const stream = video?.srcObject as MediaStream | null;
    return {
      // any size: the fake screen's depends on the Chromium version
      picture: (video?.videoWidth ?? 0) > 0,
      tracks: (stream?.getTracks() ?? [])
        .filter((t) => t.readyState === "live")
        .map((t) => t.kind)
        .sort(),
    };
  });

const watching = (viewer: Page) =>
  viewer.waitForFunction(() => (document.querySelector("video")?.videoWidth ?? 0) > 0, null, {
    timeout: 30_000,
  });

test("changing the source keeps a connected viewer's picture and sound", async () => {
  const { host, link } = await startHost();
  const viewer = await open(link);
  await watching(viewer);
  expect(await playing(viewer)).toEqual({ picture: true, tracks: ["audio", "video"] });

  await host.getByRole("button", { name: "Change source" }).click();
  await viewer.waitForTimeout(4_000);

  expect(await playing(viewer)).toEqual({ picture: true, tracks: ["audio", "video"] });
}, 60_000);

test("a new link cuts off the old one and keeps the capture", async () => {
  const { host, link } = await startHost();
  const before = await open(link);
  await watching(before);

  await host.getByRole("button", { name: "New link" }).click();
  await before.getByText(/stopped sharing|The share ended/).waitFor({ timeout: 20_000 });

  // the field shows the new link once resetLink has swapped rooms
  await host.waitForFunction(
    (old) => document.querySelector<HTMLInputElement>("input[readonly]")?.value !== old,
    link,
    { timeout: 20_000 },
  );
  const fresh = await host.locator("input[readonly]").inputValue();
  const after = await open(fresh);
  await watching(after);

  expect(await playing(after)).toEqual({ picture: true, tracks: ["audio", "video"] });
}, 60_000);

test("opening a link in the host's tab ends the share", async () => {
  const { host, link } = await startHost();
  const viewer = await open(link);
  await watching(viewer);

  await host.evaluate(() => {
    location.hash = "#AAAAAAAAAAAAAAAAAAAAAA~BBBBBBBBBBBBBBBBBBBBBB";
  });

  await viewer.getByText(/stopped sharing|The share ended/).waitFor({ timeout: 20_000 });
}, 60_000);

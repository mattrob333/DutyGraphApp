#!/usr/bin/env node
/** Fictional, fake-provider HTTP review at phone width. Build with dev-server origin 4418 first. */
import assert from "node:assert/strict";
import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { createApp } from "../../dev-server/src/index.ts";
import { createFakeProviders } from "../../dev-server/src/providers/index.ts";
import { configFromEnv } from "../../dev-server/src/config.ts";
import { IDS, uuid, version } from "../../dev-server/src/core.ts";
const require = createRequire(import.meta.url),
  { chromium } = require("playwright");
const mobile = path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."),
  root = path.join(mobile, "dist");
assert.ok(
  fs.existsSync(path.join(root, "index.html")),
  "Export the HTTP dev-server bundle first.",
);
const directory = fs.mkdtempSync(path.join(os.tmpdir(), "dg-task-review-"));
const providers = createFakeProviders(),
  taskId = uuid();
providers.conversation.extract = async (input) => {
  const segment = input.transcript[0],
    person = input.speakerMap.entries.find(
      (entry) => entry.cluster === segment.speakerCluster,
    )?.personKey;
  return {
    proposals: [
      {
        body: {
          kind: "task_card_delta",
          taskCardId: taskId,
          personKey: person,
          field: "ownerId",
          from: IDS.priya,
          to: IDS.participant,
        },
        evidence: "observed",
        sources: [
          {
            segmentId: segment.id,
            revision: segment.revision,
            quote: segment.text,
            speakerCluster: segment.speakerCluster,
            personKey: person,
          },
        ],
      },
    ],
  };
};
const config = { ...configFromEnv({}), audioDir: directory };
const { app, store } = createApp({ config, providers });
const template = store.records.tasks[IDS.task].value;
store.put(
  "tasks",
  taskId,
  version({
    ...template,
    id: taskId,
    title: "Confirm the shipping date",
    data: { ...template.data, ownerId: IDS.priya, performerId: IDS.priya },
  }),
  IDS.company,
  IDS.priya,
);
const apiServer = http.createServer(app),
  assetServer = http.createServer((req, res) => {
    const name = path.resolve(
      root,
      "." + decodeURIComponent(new URL(req.url, "http://localhost").pathname),
    );
    const safe =
      name.startsWith(root + path.sep) &&
      fs.existsSync(name) &&
      fs.statSync(name).isFile();
    const file = safe ? name : path.join(root, "index.html");
    const type =
      {
        ".js": "text/javascript",
        ".css": "text/css",
        ".html": "text/html",
        ".png": "image/png",
        ".ttf": "font/ttf",
        ".json": "application/json",
      }[path.extname(file)] ?? "application/octet-stream";
    res.writeHead(200, { "content-type": type });
    fs.createReadStream(file).pipe(res);
  });
let browser;
try {
  await new Promise((resolve) => apiServer.listen(4418, "127.0.0.1", resolve));
  await new Promise((resolve) => assetServer.listen(0, "127.0.0.1", resolve));
  const origin = "http://127.0.0.1:4418",
    prefix = "/api/mobile/meetings/v1";
  let token = "";
  const call = async (url, body) => {
    const response = await fetch(origin + url, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "Idempotency-Key": uuid(),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const result = await response.json();
    assert.ok(response.ok, `Fake API ${url} returned ${response.status}`);
    return result;
  };
  const uiCode = (await call("/dev/pairing-code", {})).pairingCode;
  const executablePath =
    process.env.CHROMIUM_PATH ??
    (fs.existsSync("/usr/bin/chromium") ? "/usr/bin/chromium" : undefined);
  browser = await chromium.launch({ executablePath, args: ["--no-sandbox"] });
  const page = await browser.newPage({
      viewport: { width: 390, height: 844 },
      reducedMotion: "reduce",
      colorScheme: "light",
    }),
    errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.setDefaultTimeout(15000);
  const base = `http://127.0.0.1:${assetServer.address().port}`;
  await page.goto(base + "/invite");
  await page
    .getByRole("button", { name: "I run meetings for a company", exact: true })
    .click();
  await page.getByLabel("Pairing code").fill(uiCode);
  await page
    .getByRole("button", { name: "Pair this phone", exact: true })
    .click();
  await page
    .getByText("Meetings", { exact: true })
    .first()
    .waitFor()
    .catch(async (error) => {
      console.error(
        "Pairing feedback",
        JSON.stringify({
          path: new URL(page.url()).pathname,
          feedback: await page.locator("[aria-live]").allTextContents(),
          errors,
        }),
      );
      throw error;
    });
  const click = async (name) =>
    page.getByRole("button", { name, exact: true }).click();
  await click("New meeting");
  await page.getByLabel("Meeting title").fill("Carrier ownership review");
  await page.getByLabel("Length in minutes").fill("25");
  await click("Plan the outcome");
  const answers = [
    "Decide who owns the carrier check.",
    "Confirm an owner.",
    "Priya and Noah contribute.",
    "Review the stated change.",
    "Noah owns the next step.",
  ];
  const questions = [
    "Why does this meeting exist?",
    "What must be true when it ends?",
    "Who must decide, contribute or carry out the work?",
    "What happens next, and by when?",
    "Who owns the result?",
  ];
  for (let index = 0; index < answers.length; index++) {
    await page
      .getByRole("heading", { name: questions[index], exact: true })
      .waitFor({ state: "visible" });
    await page.getByLabel("Your answer").fill(answers[index]);
    await page.waitForTimeout(350);
    await click(index === 4 ? "Choose attendees" : "Next");
    await page.waitForTimeout(350);
  }
  await page.getByRole("button", { name: /^Priya Shah,/ }).click();
  await click("Decision maker");
  await page.getByRole("button", { name: /^Noah Reed,/ }).click();
  await click("Build the plan");
  await page.getByText("Meeting gate", { exact: true }).waitFor();

  await click("Keep as planned");
  await click("Check everyone’s consent");
  for (const name of ["Priya Shah", "Noah Reed"])
    await page
      .getByRole("radiogroup", {
        name: `Recording consent for ${name}`,
        exact: true,
      })
      .getByRole("radio", { name: "Consent", exact: true })
      .click();
  await click("Confirm consent and continue");
  await page
    .getByRole("button", { name: /Priya Shah/ })
    .first()
    .click();
  await page
    .getByLabel("Words to keep for review")
    .fill("Noah will own the carrier check.");
  await click("Save note");
  await click("Review closing");
  await click("Review sources, owners and dates");
  await click("Confirm speaker map");
  await page.getByText("Meeting results", { exact: true }).first().waitFor();
  await page
    .getByText("Linked Task Card: Confirm the shipping date", { exact: true })
    .waitFor();
  await page
    .getByRole("button", { name: "View linked Task Card", exact: true })
    .click();
  await page
    .getByText("Check the shipment and book pickup.", { exact: true })
    .waitFor();
  const screens = path.join(mobile, "../docs/day-run/screens");
  fs.mkdirSync(screens, { recursive: true });
  const shot = async (name) => {
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth + 1,
      ),
      "Phone review has horizontal overflow",
    );
    await page.screenshot({
      path: path.join(screens, `advisor-taskcard-${name}-light.png`),
      fullPage: true,
    });
  };
  await shot("linked");
  await page
    .getByRole("button", { name: "Hide linked Task Card", exact: true })
    .click();
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await page
    .getByRole("button", { name: "New Task Card", exact: true })
    .click();
  await page
    .getByRole("button", {
      name: `Confirm the shipping date, ${taskId}`,
      exact: true,
    })
    .click();
  await page
    .getByRole("button", { name: "Noah Reed, Operations lead", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Owner: Noah Reed", exact: true })
    .click();
  await shot("edit");
  await page
    .getByRole("button", { name: "Save Task Card proposal", exact: true })
    .click();
  await page.getByRole("button", { name: "Accept", exact: true }).click();
  await page.getByText("Accepted", { exact: true }).waitFor();
  for (const name of ["Accept", "Edit", "Reject"])
    assert.equal(
      await page.getByRole("button", { name, exact: true }).count(),
      0,
      `Saved draft still exposes ${name}`,
    );
  await page
    .getByRole("button", { name: "View saved draft", exact: true })
    .click();
  await page
    .getByText("Read only · proposed · Version 1", { exact: true })
    .waitFor();
  await shot("draft");
  assert.deepEqual(errors, []);
  console.log(
    "PASS fake HTTP Task Card source inspection, target/person/owner edit and immutable saved draft at 390px.",
  );
} finally {
  if (browser) await browser.close();
  await new Promise((resolve) => apiServer.close(resolve));
  await new Promise((resolve) => assetServer.close(resolve));
  fs.rmSync(directory, { recursive: true, force: true });
}

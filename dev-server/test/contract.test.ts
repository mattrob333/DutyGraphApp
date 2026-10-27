import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import { once } from "node:events";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { createApp } from "../src/index.ts";
import { IDS, uuid } from "../src/core.ts";
const contract = JSON.parse(
  readFileSync(
    new URL("../../contracts/meeting-mobile.openapi.json", import.meta.url),
    "utf8",
  ),
) as {
  components: Record<string, unknown>;
  paths: Record<
    string,
    Record<
      string,
      {
        requestBody?: { content: Record<string, { schema: object }> };
        responses: Record<
          string,
          { content?: Record<string, { schema: object }> }
        >;
      }
    >
  >;
};
const ajv = new Ajv2020({ strict: false, allErrors: true });
addFormats(ajv);
ajv.addFormat("binary", true);
const validate = (schema: object, body: unknown) => {
  const check = ajv.compile({ ...schema, components: contract.components });
  assert.equal(check(body), true, JSON.stringify(check.errors));
};
test("all proposed runtime routes have an OpenAPI operation and schemas compile", () => {
  for (const [name, prefix] of [
    ["meetings", "/api/mobile/meetings/v1"],
    ["v1x", "/api/mobile/v1x"],
  ]) {
    const source = readFileSync(
      new URL("../src/" + name + ".ts", import.meta.url),
      "utf8",
    );
    for (const match of source.matchAll(
      /\b(?:r|router)\.(get|post|patch)\(\s*["']([^"']+)/g,
    )) {
      const path = prefix + match[2].replace(/:([A-Za-z]+)/g, "{$1}");
      assert.ok(contract.paths[path]?.[match[1]], `${match[1]} ${path}`);
    }
  }
  for (const operations of Object.values(contract.paths))
    for (const operation of Object.values(operations))
      for (const response of Object.values(operation.responses)) {
        const schema = response.content?.["application/json"]?.schema;
        if (schema) ajv.compile({ ...schema, components: contract.components });
      }
});
test("actual advisor HTTP lifecycle conforms to proposed request and response schemas", async () => {
  const { app } = createApp();
  const server = createServer(app).listen(0, "127.0.0.1");
  await once(server, "listening");
  const base = `http://127.0.0.1:${(server.address() as import("node:net").AddressInfo).port}`;
  let token = "";
  const call = async (
    template: string,
    method: "get" | "post" | "patch",
    body?: unknown,
    ids: Record<string, string> = {},
  ) => {
    const operation = contract.paths[template][method];
    if (body !== undefined && operation.requestBody)
      validate(operation.requestBody.content["application/json"].schema, body);
    const path = template.replace(
      /\{([^}]+)\}/g,
      (_m, key: string) => ids[key],
    );
    const response = await fetch(base + path, {
      method: method.toUpperCase(),
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": uuid(),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const result = response.status === 204 ? null : await response.json();
    const expected = operation.responses[String(response.status)];
    assert.ok(
      expected,
      JSON.stringify({ path, status: response.status, result }),
    );
    const schema = expected.content?.["application/json"]?.schema;
    if (schema) validate(schema, result);
    return result;
  };
  const api = "/api/mobile/meetings/v1";
  try {
    const code = await call("/dev/pairing-code", "post", {});
    const auth = await call(api + "/advisor/pair", "post", {
      pairingCode: code.pairingCode,
    });
    token = auth.accessToken;
    await call(api + "/people", "get");
    const m = await call(api + "/meetings", "post", {
      title: "Carrier decision",
      minutes: 30,
      purpose: "Decide the carrier launch date",
      outcomes: ["Decide launch date"],
      execution: "Review facts",
      attendees: [{ personId: IDS.participant, roles: ["decision_maker"] }],
    });
    await call(api + "/meetings/{id}/plan", "post", {}, { id: m.id });
    const s = await call(
      api + "/meetings/{id}/sessions",
      "post",
      { mode: "copilot" },
      { id: m.id },
    );
    await call(
      api + "/sessions/{id}/consent",
      "post",
      {
        attendees: [
          {
            personId: IDS.participant,
            state: "consented",
            at: new Date().toISOString(),
          },
        ],
        noticeVersion: "1",
        appVersion: "1",
      },
      { id: s.id },
    );
    await call(
      api + "/sessions/{id}/transcript",
      "post",
      {
        segments: [
          {
            id: uuid(),
            revision: 1,
            startMs: 0,
            endMs: 1000,
            text: "We decided to launch Tuesday.",
            speaker: "S1",
          },
        ],
      },
      { id: s.id },
    );
    await call(api + "/sessions/{id}/coach", "post", {}, { id: s.id });
    await call(
      api + "/sessions/{id}/park",
      "post",
      { text: "Check carrier timing", atMs: 1000 },
      { id: s.id },
    );
    await call(api + "/sessions/{id}/finish", "post", {}, { id: s.id });
    await call(
      api + "/sessions/{id}/speakers",
      "post",
      { entries: [{ cluster: "S1", personKey: IDS.participant }] },
      { id: s.id },
    );
    await call(api + "/sessions/{id}", "get", undefined, { id: s.id });
    await call(api + "/sessions/{id}/export", "get", undefined, { id: s.id });
    await call("/api/mobile/v1x/config", "get");
    const setup = await call(api + "/setup", "post", {});
    await call(
      api + "/setup/{id}/understand",
      "post",
      {
        answers: [{ key: "question.0", text: "We distribute workshop parts." }],
      },
      { id: setup.id },
    );
  } finally {
    await new Promise<void>((r) => server.close(() => r()));
  }
});

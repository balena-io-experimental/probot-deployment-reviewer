// You can import your modules
// import index from '../src/index'

import nock from "nock";
// Requiring our app implementation
import myProbotApp from "../src/index.js";
import { Probot, ProbotOctokit } from "probot";
// Requiring our fixtures
//import payload from "./fixtures/issues.opened.json" with { "type": "json"};
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { describe, beforeEach, afterEach, test, expect } from "vitest";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const privateKey = fs.readFileSync(
  path.join(__dirname, "fixtures/mock-cert.pem"),
  "utf-8"
);

const payload = JSON.parse(
  fs.readFileSync(
    path.join(__dirname, "fixtures/deployment_review.requested.json"),
    "utf-8"
  )
);

describe("My Probot app", () => {
  let probot: any;

  beforeEach(() => {
    nock.disableNetConnect();
    probot = new Probot({
      appId: 123,
      privateKey,
      // disable request throttling and retries for testing
      Octokit: ProbotOctokit.defaults({
        retry: { enabled: false },
        throttle: { enabled: false },
      }),
    });
    // Load our app into probot
    probot.load(myProbotApp);
  });

  test("approves the review if the author is a reviewer", async () => {
    const mock = nock("https://api.github.com")
      // Intercept the request to get the installation token
      .post("/app/installations/2/access_tokens")
      .reply(200, {
        token: "test",
        permissions: {
          checks: "read",
          deployments: "read",
          members: "read",
        },
      })

      // Intercept the request to check the user's team membership
      .get("/orgs/test-org/teams/test-team/memberships/test-user")
      .reply(200, { state: "active" })

      // Intercept the request to get environment information (if needed)
      .get("/repos/test-org/test-repo/environments/test-environment")
      .reply(200, {
        id: 2,
      })

      // Intercept the request to approve the deployment review
      .post("/repos/test-org/test-repo/actions/runs/1/pending_deployments", {
        environment_ids: [2],
        state: "approved",
        comment: "👍 Automatically approved by Probot Deployment Reviewer",
      })
      .reply(200);

    await probot.receive({
      name: "deployment_review",
      payload,
    });

    // expect(nock.isDone()).toBe(true);
    expect(mock.pendingMocks()).toStrictEqual([]);
  });

  afterEach(() => {
    nock.cleanAll();
    nock.enableNetConnect();
  });
});

// For more information about testing with Jest see:
// https://facebook.github.io/jest/

// For more information about using TypeScript in your tests, Jest recommends:
// https://github.com/kulshekhar/ts-jest

// For more information about testing with Nock see:
// https://github.com/nock/nock

import test from "node:test";
import assert from "node:assert/strict";
import type { NextFunction, Request, Response } from "express";
import { config } from "./config";
import { isAuthorizedOperatorRequest, requireOperatorAccess, requireWebhookAccess } from "./serverAuth";

function createResponseRecorder() {
  let statusCode = 200;
  let body: unknown = null;
  const headers = new Map<string, string>();

  const res = {
    status(code: number) {
      statusCode = code;
      return res;
    },
    send(value: unknown) {
      body = value;
      return res;
    },
    setHeader(name: string, value: string) {
      headers.set(name, value);
    },
  } as unknown as Response;

  return {
    res,
    get statusCode() {
      return statusCode;
    },
    get body() {
      return body;
    },
    getHeader(name: string) {
      return headers.get(name);
    },
  };
}

function createNextRecorder() {
  let called = false;
  const next: NextFunction = () => {
    called = true;
  };

  return {
    next,
    get called() {
      return called;
    },
  };
}

test("isAuthorizedOperatorRequest accepts bearer tokens and cookies", () => {
  const original = config.OPERATOR_TOKEN;
  config.OPERATOR_TOKEN = "operator-secret";

  assert.equal(
    isAuthorizedOperatorRequest({
      headers: {
        authorization: "Bearer operator-secret",
      },
      url: "/canvas",
    } as Request),
    true,
  );

  assert.equal(
    isAuthorizedOperatorRequest({
      headers: {
        cookie: "hiro_operator=operator-secret",
      },
      url: "/canvas",
    } as Request),
    true,
  );

  assert.equal(
    isAuthorizedOperatorRequest({
      headers: {},
      url: "/canvas",
    } as Request),
    false,
  );

  config.OPERATOR_TOKEN = original;
});

test("requireOperatorAccess authorizes query token and sets operator cookie", () => {
  const original = config.OPERATOR_TOKEN;
  config.OPERATOR_TOKEN = "operator-secret";

  const req = {
    headers: {
      "x-forwarded-proto": "https",
    },
    originalUrl: "/canvas?token=operator-secret",
    secure: false,
  } as unknown as Request;
  const response = createResponseRecorder();
  const next = createNextRecorder();

  requireOperatorAccess(req, response.res, next.next);

  assert.equal(next.called, true);
  assert.equal(response.statusCode, 200);
  assert.match(response.getHeader("Set-Cookie") || "", /hiro_operator=operator-secret/);
  assert.match(response.getHeader("Set-Cookie") || "", /Secure/);

  config.OPERATOR_TOKEN = original;
});

test("requireWebhookAccess rejects incorrect secrets", () => {
  const original = config.WEBHOOK_SECRET;
  config.WEBHOOK_SECRET = "webhook-secret";

  const req = {
    headers: {
      "x-hiro-webhook-secret": "wrong-secret",
    },
    originalUrl: "/webhook",
  } as unknown as Request;
  const response = createResponseRecorder();
  const next = createNextRecorder();

  requireWebhookAccess(req, response.res, next.next);

  assert.equal(next.called, false);
  assert.equal(response.statusCode, 401);
  assert.deepEqual(response.body, { error: "Unauthorized." });

  config.WEBHOOK_SECRET = original;
});

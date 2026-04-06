import { timingSafeEqual } from "crypto";
import type { IncomingMessage } from "http";
import type { NextFunction, Request, Response } from "express";
import { config } from "./config";

const OPERATOR_COOKIE_NAME = "hiro_operator";
const OPERATOR_QUERY_KEYS = ["token", "access_token"];
const WEBHOOK_HEADER_KEYS = ["x-hiro-webhook-secret", "x-webhook-secret"];
const OPERATOR_SESSION_MAX_AGE_SECONDS = 60 * 60 * 8;

function parseCookies(header: string | undefined): Record<string, string> {
  if (!header) {
    return {};
  }

  return header
    .split(";")
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .reduce<Record<string, string>>((cookies, chunk) => {
      const separator = chunk.indexOf("=");
      if (separator <= 0) {
        return cookies;
      }

      const key = chunk.slice(0, separator).trim();
      const value = chunk.slice(separator + 1).trim();
      cookies[key] = decodeURIComponent(value);
      return cookies;
    }, {});
}

function safeEquals(expected: string, received: string): boolean {
  const expectedBuffer = Buffer.from(expected);
  const receivedBuffer = Buffer.from(received);
  if (expectedBuffer.length !== receivedBuffer.length) {
    return false;
  }

  return timingSafeEqual(expectedBuffer, receivedBuffer);
}

function readAuthorizationBearer(headers: IncomingMessage["headers"]): string | null {
  const header = headers.authorization;
  if (!header) {
    return null;
  }

  const value = Array.isArray(header) ? header[0] : header;
  const match = value.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

function readQueryToken(req: Request | IncomingMessage, keys: string[]): string | null {
  const rawUrl = "originalUrl" in req && typeof req.originalUrl === "string"
    ? req.originalUrl
    : req.url;
  if (!rawUrl) {
    return null;
  }

  const url = new URL(rawUrl, "http://localhost");
  for (const key of keys) {
    const value = url.searchParams.get(key)?.trim();
    if (value) {
      return value;
    }
  }

  return null;
}

function readHeaderToken(req: Request | IncomingMessage, keys: string[]): string | null {
  for (const key of keys) {
    const value = req.headers[key];
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
    if (Array.isArray(value) && value[0]?.trim()) {
      return value[0].trim();
    }
  }

  return null;
}

function readCookieToken(req: Request | IncomingMessage, cookieName: string): string | null {
  const header = req.headers.cookie;
  const cookieHeader = Array.isArray(header) ? header.join(";") : header;
  const cookies = parseCookies(cookieHeader);
  const token = cookies[cookieName]?.trim();
  return token || null;
}

function isHttpsRequest(req: Request): boolean {
  if (req.secure) {
    return true;
  }

  const forwardedProto = req.headers["x-forwarded-proto"];
  const value = Array.isArray(forwardedProto) ? forwardedProto[0] : forwardedProto;
  return value === "https";
}

function setOperatorCookie(req: Request, res: Response, token: string) {
  const attributes = [
    `${OPERATOR_COOKIE_NAME}=${encodeURIComponent(token)}`,
    "HttpOnly",
    "Path=/",
    "SameSite=Strict",
    `Max-Age=${OPERATOR_SESSION_MAX_AGE_SECONDS}`,
  ];

  if (isHttpsRequest(req)) {
    attributes.push("Secure");
  }

  res.setHeader("Set-Cookie", attributes.join("; "));
}

function readOperatorToken(req: Request | IncomingMessage): string | null {
  return (
    readAuthorizationBearer(req.headers)
    || readHeaderToken(req, ["x-hiro-operator-token", "x-access-token"])
    || readCookieToken(req, OPERATOR_COOKIE_NAME)
    || readQueryToken(req, OPERATOR_QUERY_KEYS)
  );
}

function readWebhookToken(req: Request | IncomingMessage): string | null {
  return readHeaderToken(req, WEBHOOK_HEADER_KEYS) || readAuthorizationBearer(req.headers);
}

function isAuthorized(expectedSecret: string, presentedSecret: string | null): boolean {
  if (!expectedSecret.trim() || !presentedSecret?.trim()) {
    return false;
  }

  return safeEquals(expectedSecret.trim(), presentedSecret.trim());
}

export function isAuthorizedOperatorRequest(req: Request | IncomingMessage): boolean {
  return isAuthorized(config.OPERATOR_TOKEN, readOperatorToken(req));
}

export function requireOperatorAccess(req: Request, res: Response, next: NextFunction) {
  if (!config.OPERATOR_TOKEN.trim()) {
    res.status(503).send("Operator access is not configured.");
    return;
  }

  const presentedToken = readOperatorToken(req);
  if (!isAuthorized(config.OPERATOR_TOKEN, presentedToken)) {
    res.status(401).send("Unauthorized.");
    return;
  }

  if (presentedToken && readCookieToken(req, OPERATOR_COOKIE_NAME) !== presentedToken) {
    setOperatorCookie(req, res, presentedToken);
  }

  next();
}

export function requireWebhookAccess(req: Request, res: Response, next: NextFunction) {
  if (!config.WEBHOOK_SECRET.trim()) {
    res.status(503).send({ error: "Webhook access is not configured." });
    return;
  }

  if (!isAuthorized(config.WEBHOOK_SECRET, readWebhookToken(req))) {
    res.status(401).send({ error: "Unauthorized." });
    return;
  }

  next();
}

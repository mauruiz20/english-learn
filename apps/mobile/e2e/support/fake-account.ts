// A fake Google sign-in page and a fake English Learn API for e2e specs: a local HTTP server per
// test, which the e2e build uses instead of the real ones when the spec stores their URLs in
// localStorage (`english-learn.e2e.*`, see src/infrastructure/auth/e2e-endpoints.ts). Playwright
// routes cannot stand in for them: in WebKit, request interception breaks expo-sqlite's worker.
// It keeps what a real API would (one account, its event log with server sequence numbers, the
// session), so two "devices" in one test see each other's progress.
import type { BrowserContext } from "@playwright/test";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";

type StoredEvent = {
  seq: number;
  id: string;
  deviceId: string;
  occurredAt: number;
  localDate: string;
  type: string;
  payload: unknown;
};

export type SyncBody = {
  deviceId: string;
  cursor: number | null;
  events: { id: string; type: string; localDate: string; occurredAt: number; payload: unknown }[];
};

const base64url = (value: string) => Buffer.from(value).toString("base64url");

async function readBody(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(chunk as Buffer);
  const text = Buffer.concat(chunks).toString("utf8");
  return text === "" ? undefined : JSON.parse(text);
}

export class FakeAccount {
  readonly email = "ana@example.com";
  readonly userId = "019a3456-7890-7abc-8def-0123456789ab";
  /** Every Google authorization request, as URL query parameters. */
  readonly googleRequests: URLSearchParams[] = [];
  /** Every `/v1/auth/google` body. */
  readonly signIns: { idToken: string; nonce?: string }[] = [];
  /** Every `/v1/sync` body, in order. */
  readonly syncs: SyncBody[] = [];
  /** `true` once the app sent `X-Token-Transport: cookie` and `credentials` on sign-in. */
  cookieTransport = false;
  private readonly log: StoredEvent[] = [];
  private seq = 0;
  private sessionActive = false;
  private accessCounter = 0;
  private server: Server | null = null;
  private origin = "";

  /** Starts the server and points every page of `context` at it. */
  async install(context: BrowserContext): Promise<void> {
    this.server = createServer((request, response) => {
      this.handle(request, response).catch((error: unknown) => {
        response.writeHead(500).end(String(error));
      });
    });
    await new Promise<void>((resolve) => this.server!.listen(0, "127.0.0.1", resolve));
    const { port } = this.server.address() as AddressInfo;
    this.origin = `http://127.0.0.1:${port}`;
    await context.addInitScript((origin: string) => {
      localStorage.setItem("english-learn.e2e.apiBaseUrl", origin);
      localStorage.setItem("english-learn.e2e.googleAuthUrl", `${origin}/google/auth`);
    }, this.origin);
  }

  async close(): Promise<void> {
    await new Promise<void>((resolve) =>
      this.server ? this.server.close(() => resolve()) : resolve(),
    );
  }

  /** Event types the server holds, in server order. */
  storedTypes(): string[] {
    return this.log.map((e) => e.type);
  }

  private async handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const url = new URL(request.url ?? "/", this.origin);
    if (request.method === "GET" && url.pathname === "/google/auth") {
      this.google(url.searchParams, response);
      return;
    }
    const cors = {
      "Access-Control-Allow-Origin": request.headers.origin ?? "",
      "Access-Control-Allow-Credentials": "true",
      Vary: "Origin",
    };
    if (request.method === "OPTIONS") {
      response
        .writeHead(204, {
          ...cors,
          "Access-Control-Allow-Methods": "GET, POST, DELETE",
          "Access-Control-Allow-Headers":
            "Authorization, Content-Type, X-Token-Transport, X-Requested-With",
          "Access-Control-Max-Age": "600",
        })
        .end();
      return;
    }
    const json = (status: number, body?: unknown): void => {
      response
        .writeHead(status, { ...cors, "Content-Type": "application/json" })
        .end(body === undefined ? "" : JSON.stringify(body));
    };
    const error = (status: number, code: string): void =>
      json(status, { error: { code, message: code } });
    const body = await readBody(request);

    switch (`${request.method} ${url.pathname}`) {
      case "POST /v1/auth/google": {
        const { idToken, nonce } = body as { idToken: string; nonce?: string };
        this.signIns.push({ idToken, ...(nonce === undefined ? {} : { nonce }) });
        this.cookieTransport =
          request.headers["x-token-transport"] === "cookie" &&
          request.headers["x-requested-with"] === "english-learn";
        const claims = JSON.parse(Buffer.from(idToken.split(".")[1] ?? "", "base64url").toString());
        if (nonce === undefined || claims.nonce !== nonce)
          return error(401, "invalid_google_token");
        this.sessionActive = true;
        return json(200, { ...this.tokens(), user: { id: this.userId, email: this.email } });
      }
      case "POST /v1/auth/refresh":
        if (!this.sessionActive) return error(401, "invalid_refresh_token");
        return json(200, this.tokens());
      case "POST /v1/auth/logout":
        this.sessionActive = false;
        return json(204);
      case "DELETE /v1/account":
        this.sessionActive = false;
        this.log.length = 0;
        return json(204);
      case "POST /v1/sync":
        if (!this.authorized(request.headers.authorization)) return error(401, "invalid_token");
        return json(200, this.sync(body as SyncBody));
      default:
        return error(404, "not_found");
    }
  }

  /** Google: the learner picks the account; back to the app with an ID token in the fragment. */
  private google(params: URLSearchParams, response: ServerResponse): void {
    this.googleRequests.push(params);
    const claims = { sub: "google-ana", email: this.email, nonce: params.get("nonce") };
    const idToken = [
      base64url(JSON.stringify({ alg: "RS256" })),
      base64url(JSON.stringify(claims)),
      "signature",
    ].join(".");
    const target = `${params.get("redirect_uri")}#id_token=${idToken}&state=${params.get("state")}&authuser=0`;
    response
      .writeHead(200, { "Content-Type": "text/html; charset=utf-8" })
      .end(
        `<!doctype html><title>Google</title><script>location.replace(${JSON.stringify(target)})</script>`,
      );
  }

  private tokens() {
    this.accessCounter += 1;
    return {
      accessToken: `access-${this.accessCounter}`,
      accessTokenExpiresAt: new Date(Date.now() + 15 * 60_000).toISOString(),
    };
  }

  private authorized(header: string | undefined): boolean {
    return this.sessionActive && /^Bearer access-\d+$/.test(header ?? "");
  }

  private sync(request: SyncBody) {
    this.syncs.push(request);
    for (const event of request.events) {
      if (this.log.some((stored) => stored.id === event.id)) continue;
      this.seq += 1;
      this.log.push({ ...event, seq: this.seq, deviceId: request.deviceId });
    }
    const after = request.cursor ?? 0;
    const newer = this.log.filter((e) => e.seq > after);
    const page = newer.slice(0, 500);
    return {
      events: page.map(({ seq: _, ...event }) => event),
      cursor: page.at(-1)?.seq ?? after,
      hasMore: newer.length > page.length,
      accepted: request.events.length,
      duplicates: 0,
      conflicts: [],
    };
  }
}

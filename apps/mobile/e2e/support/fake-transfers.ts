// A fake English Learn API for the progress transfer between the app's old and new web addresses:
// a local HTTP server per test with POST /v1/transfers and POST /v1/transfers/claim, anonymous
// and single-use like the real ones (CORS without credentials). The e2e build uses it when the
// spec stores its URL in localStorage (`english-learn.e2e.apiBaseUrl`, see e2e-endpoints.ts).
import type { BrowserContext } from "@playwright/test";
import { randomBytes } from "node:crypto";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";

export type TransferEvent = {
  id: string;
  occurredAt: number;
  localDate: string;
  type: string;
  payload: unknown;
};

async function readBody(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(chunk as Buffer);
  const text = Buffer.concat(chunks).toString("utf8");
  return text === "" ? undefined : JSON.parse(text);
}

export class FakeTransfers {
  /** Every created transfer's events, in order. */
  readonly created: TransferEvent[][] = [];
  /** Every claim attempt: the token and whether it got the events. */
  readonly claims: { token: string; ok: boolean }[] = [];
  /** Origins that called the API (the `Origin` header), in order. */
  readonly origins: string[] = [];
  private readonly pending = new Map<string, TransferEvent[]>();
  private server: Server | null = null;
  private origin = "";

  /** Starts the server and points every page of `context` (both addresses) at it. */
  async install(
    context: BrowserContext,
    addresses: { oldWebOrigin?: string; newWebOrigin: string },
  ): Promise<void> {
    this.server = createServer((request, response) => {
      this.handle(request, response).catch((error: unknown) => {
        response.writeHead(500).end(String(error));
      });
    });
    await new Promise<void>((resolve) => this.server!.listen(0, "127.0.0.1", resolve));
    const { port } = this.server.address() as AddressInfo;
    this.origin = `http://127.0.0.1:${port}`;
    await context.addInitScript(
      ({ api, newWebOrigin }: { api: string; newWebOrigin: string }) => {
        localStorage.setItem("english-learn.e2e.apiBaseUrl", api);
        localStorage.setItem("english-learn.e2e.newWebOrigin", newWebOrigin);
      },
      { api: this.origin, newWebOrigin: addresses.newWebOrigin },
    );
  }

  async close(): Promise<void> {
    await new Promise<void>((resolve) =>
      this.server ? this.server.close(() => resolve()) : resolve(),
    );
  }

  private async handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const url = new URL(request.url ?? "/", this.origin);
    const cors = { "Access-Control-Allow-Origin": request.headers.origin ?? "", Vary: "Origin" };
    if (request.method === "OPTIONS") {
      response
        .writeHead(204, {
          ...cors,
          "Access-Control-Allow-Methods": "POST",
          "Access-Control-Allow-Headers": "Content-Type",
          "Access-Control-Max-Age": "600",
        })
        .end();
      return;
    }
    const json = (status: number, body: unknown): void => {
      response
        .writeHead(status, { ...cors, "Content-Type": "application/json" })
        .end(JSON.stringify(body));
    };
    if (request.headers.origin) this.origins.push(request.headers.origin);
    const body = await readBody(request);

    switch (`${request.method} ${url.pathname}`) {
      case "POST /v1/transfers": {
        const { events } = body as { events: TransferEvent[] };
        const token = randomBytes(32).toString("base64url");
        this.created.push(events);
        this.pending.set(token, events);
        return json(201, {
          token,
          expiresAt: new Date(Date.now() + 15 * 60_000).toISOString(),
        });
      }
      case "POST /v1/transfers/claim": {
        const { token } = body as { token: string };
        const events = this.pending.get(token);
        this.pending.delete(token);
        this.claims.push({ token, ok: events !== undefined });
        if (events === undefined) {
          return json(404, { error: { code: "transfer_not_found", message: "gone" } });
        }
        return json(200, { events });
      }
      default:
        return json(404, { error: { code: "not_found", message: "not found" } });
    }
  }
}

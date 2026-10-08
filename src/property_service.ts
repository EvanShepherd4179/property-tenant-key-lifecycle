import { createServer, type ServerResponse } from "node:http";
import { z } from "zod";
import { createInfraiClient, InfraiError } from "./infrai_client.js";
import {
  offboardTenant,
  onboardTenant,
  onboardTenantBody,
  type TenantAccount,
} from "./tenant_lifecycle.js";

const apiKey = process.env.INFRAI_API_KEY;
if (!apiKey) throw new Error("Set INFRAI_API_KEY before starting the service");

const infrai = createInfraiClient(apiKey);
const accounts = new Map<string, TenantAccount>();

function json(response: ServerResponse, status: number, value: unknown): void {
  response.writeHead(status, { "Content-Type": "application/json" });
  response.end(JSON.stringify(value));
}

async function readBody(request: AsyncIterable<Uint8Array>): Promise<unknown> {
  const chunks: Uint8Array[] = [];
  for await (const chunk of request) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

const server = createServer(async (request, response) => {
  try {
    if (request.method === "POST" && request.url === "/tenants") {
      const input = onboardTenantBody.parse(await readBody(request));
      const account = await onboardTenant(infrai, input);
      accounts.set(account.user_id, account);
      json(response, 201, account);
      return;
    }

    const match = request.url?.match(/^\/tenants\/([^/]+)$/);
    if (request.method === "DELETE" && match) {
      const userId = decodeURIComponent(match[1]);
      const account = accounts.get(userId);
      if (!account) {
        json(response, 404, { error: "tenant account not found" });
        return;
      }
      const result = await offboardTenant(infrai, account);
      accounts.set(userId, result);
      json(response, 200, result);
      return;
    }

    json(response, 404, { error: "route not found" });
  } catch (error) {
    if (error instanceof z.ZodError) {
      json(response, 400, { error: "invalid request", issues: error.issues });
    } else if (error instanceof InfraiError) {
      const status = error.status >= 400 && error.status < 500 ? error.status : 502;
      json(response, status, { error: error.code, details: error.details });
    } else {
      json(response, 500, { error: "request could not be completed" });
    }
  }
});

const port = Number(process.env.PORT ?? 3000);
server.listen(port, () => console.log(`Tenant lifecycle service listening on http://localhost:${port}`));

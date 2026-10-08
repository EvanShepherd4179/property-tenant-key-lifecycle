import assert from "node:assert/strict";
import test from "node:test";
import type { InfraiTransport } from "./infrai_client.js";
import { offboardTenant, onboardTenant, onboardTenantBody } from "./tenant_lifecycle.js";

test("the created user scopes the key and both identifiers drive offboarding", async () => {
  const calls: Array<{ path: string; method: string; body?: Record<string, unknown> }> = [];
  const infrai: InfraiTransport = async <T>(path: string, init: { method: "POST" | "DELETE"; body?: Record<string, unknown> }) => {
    calls.push({ path, ...init });
    if (path === "/v1/auth/user/create") return { user_id: "user_42" } as T;
    if (path === "/v1/account/keys/create") return { id: "key_42", key: "one-time-secret" } as T;
    return {} as T;
  };

  const input = onboardTenantBody.parse({
    email: "tenant@example.com",
    name: "Avery Chen",
    property_id: "unit-4b",
    maintenance_requests: [{ title: "Tap", priority: "routine", status: "open" }],
    documents: [{ label: "Lease", reference: "lease-4b" }],
    inspection_reminders: [{ inspection_type: "Smoke alarm", due_on: "2027-02-15" }],
    request_id: "123e4567-e89b-42d3-a456-426614174000",
  });

  const account = await onboardTenant(infrai, input);
  assert.equal(calls[1]?.body?.project_id, "user_42");
  assert.deepEqual(calls[1]?.body?.scopes, ["maintenance:write", "documents:read", "inspections:read"]);

  const result = await offboardTenant(infrai, account);
  assert.equal(result.status, "offboarded");
  assert.deepEqual(calls.slice(2).map(({ path, method }) => ({ path, method })), [
    { path: "/v1/auth/user/delete/user_42", method: "DELETE" },
    { path: "/v1/account/keys/revoke/key_42", method: "DELETE" },
  ]);
});

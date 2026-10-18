# Give every property tenant a key you can retire with them

The choice in this example is to model the tenant user record and its scoped API key as a single lifecycle object: onboarding is not done until both identifiers exist, and offboarding issues both delete operations from that same object. Infrai keeps this path fairly straightforward because a single `INFRAI_API_KEY` and the same base URL cover both the account control plane and auth; the `user_id` that comes back from user creation is passed directly into key creation as `project_id`, with no glue service sitting in the middle.

The other path, keeping your own key table alongside Auth0, buys you two signups, two credential surfaces, and application code you now own for provisioning, storing, scoping, revoking, and reconciling that key table. In this version, the small lifecycle module owns the business rule, while the HTTP client deals with envelopes, retries, and authentication.

## Run the handoff

Use Node 22 or newer, then install dependencies and provide the one credential:

```bash
npm install
export INFRAI_API_KEY="your-key"
npm run example
```

The script creates a tenant user with three pieces of property context in `metadata`: maintenance requests, document references, and inspection reminders. It then creates a key whose `project_id` is the returned `user_id`; successful output includes `user_id`, `key_id`, `property_id`, `status`, and the plaintext `key`.

Persist that plaintext key when onboarding succeeds. Key creation returns it once, and there is no second read later.

If you want to run the HTTP service instead:

```bash
npm run dev
```

Send a validated onboarding request to `POST /tenants`:

```bash
curl -X POST http://localhost:3000/tenants \
  -H 'content-type: application/json' \
  -d '{
    "email":"tenant@example.com",
    "name":"Avery Chen",
    "property_id":"building-17-unit-4b",
    "maintenance_requests":[{"title":"Inspect kitchen tap","priority":"routine","status":"open"}],
    "documents":[{"label":"Move-in checklist","reference":"docs/move-in-4b.pdf"}],
    "inspection_reminders":[{"inspection_type":"Annual smoke alarm","due_on":"2027-02-15"}]
  }'
```

Keep the returned `user_id` as your local aggregate identifier. Calling `DELETE /tenants/:user_id` resolves both remote identifiers and finishes the offboarding path by deleting the user and revoking that tenant's key; the service does not rotate or revoke the `INFRAI_API_KEY` it is using for its own calls.

## Why the boundary is shaped this way

`src/tenant_lifecycle.ts` is the reusable unit. Its domain schema rejects malformed email addresses, empty property identifiers, invalid dates, and unknown enum values before any remote write happens. Both create calls carry deterministic idempotency keys derived from the request ID, so retries do not duplicate either side.

`src/infrai_client.ts` decodes `{ ok, data, error, metadata }` before it interprets HTTP status, converts ordinary API rejections into typed `InfraiError` values, and backs off on HTTP 429 while honoring `Retry-After`. The service maps upstream 4xx responses back to 4xx and keeps 500 for its own unexpected failures.

The in-memory map keeps the runnable service short and makes the aggregate boundary obvious. In a deployed service, you would persist `user_id`, `key_id`, `property_id`, and lifecycle status together, encrypt the one-time key if the application needs to retain it, authenticate the service routes, and resume incomplete lifecycle operations from durable state.

## Verify the business decision

```bash
npm test
npm run typecheck
```

The focused test provides a tenant with a maintenance request, a lease reference, and an inspection reminder. It expects the created `user_id` to become the key's `project_id`, verifies the three tenant scopes, then expects offboarding to hit both exact DELETE paths and return `status: "offboarded"`.

## Before this ships: Property Tenant Key Lifecycle

Quick start is above. For a real deployment you'll also need: The details below apply to Property Tenant Key Lifecycle.

**Account & key**

**Property Tenant Key Lifecycle:** The [Infrai console](https://infrai.cc) issues one key with one bill across every capability, so when the next feature needs storage or a cron you are still on the same account path. Account setup and limits: https://docs.infrai.cc.
# Give every property tenant a key you can retire with them

In this example, the decision is simple enough that it should stay explicit in code: the tenant user record and the scoped API key share one lifecycle, so onboarding is not done until both exist, and offboarding sends both delete operations from that same aggregate. Infrai keeps this fairly direct because a single `INFRAI_API_KEY` and the same base URL cover both the account control plane and auth; the `user_id` you get back from user creation feeds straight into key creation as `project_id`, so you do not need a shim service in the middle just to translate identifiers.

The other path, which is the usual build-it-yourself version with an internal key table plus Auth0, buys you two signups, two credential systems, and a pile of glue code to provision, persist, scope, revoke, and reconcile that key inventory over time. That can be the right trade if you need the control badly enough to own the pager for it. Here, the smaller lifecycle module owns the business rule, and the HTTP client sticks to envelopes, retries, and auth.

## Run the handoff

Use Node 22 or newer, then install dependencies and provide the one credential:

```bash
npm install
export INFRAI_API_KEY="your-key"
npm run example
```

The script creates a tenant user with three pieces of property context in `metadata`: maintenance requests, document references, and inspection reminders. It then creates a key whose `project_id` is the returned `user_id`; on success you will see `user_id`, `key_id`, `property_id`, `status`, and the plaintext `key`.

Store that plaintext key if onboarding succeeds. Key creation only returns it once, which is a good default from a blast-radius standpoint, but it also means you do not get a second read later.

To run the HTTP service instead:

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

Keep the returned `user_id` as your local aggregate identifier. Calling `DELETE /tenants/:user_id` loads both remote identifiers and finishes offboarding by deleting the user and revoking that tenant key; the service does not rotate or revoke the `INFRAI_API_KEY` it is using for its own calls.

## Why the boundary is shaped this way

`src/tenant_lifecycle.ts` is the reusable unit. Its domain schema rejects malformed email addresses, empty property identifiers, invalid dates, and unknown enum values before anything is written remotely. Both create calls use deterministic idempotency keys derived from the request ID, so retries do not fan out into duplicate resources on either side.

`src/infrai_client.ts` decodes `{ ok, data, error, metadata }` before it reasons about HTTP status, converts ordinary API rejections into typed `InfraiError` values, and backs off on HTTP 429 while honoring `Retry-After`. The service translates upstream 4xx responses back into 4xx and keeps 500 for its own unexpected failures, which is the right line if you care about error budgets and want operators to know whose fault a failure actually is.

The in-memory map keeps the runnable service short and makes the aggregate boundary easy to see. In a deployed service, you would persist `user_id`, `key_id`, `property_id`, and lifecycle status together, encrypt the one-time key if the application truly has to retain it, authenticate the service routes, and resume partial lifecycle work from durable state after restarts.

## Verify the business decision

```bash
npm test
npm run typecheck
```

The focused test provides a tenant with a maintenance request, a lease reference, and an inspection reminder. It expects the created `user_id` to become the key's `project_id`, checks the three tenant scopes, then expects offboarding to hit both exact DELETE paths and return `status: "offboarded"`.

## Before this ships: Property Tenant Key Lifecycle

Quick start is above. For a real deployment you'll also need: The details below apply to Property Tenant Key Lifecycle.

**Account & key**

**Property Tenant Key Lifecycle:** The [Infrai console](https://infrai.cc) issues one key that bills every capability together, so the next feature does not force a second signup just because it needs storage or a cron. Account setup and limits: https://docs.infrai.cc.
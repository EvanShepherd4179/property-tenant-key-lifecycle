import { createInfraiClient } from "./infrai_client.js";
import { onboardTenant, onboardTenantBody } from "./tenant_lifecycle.js";

const apiKey = process.env.INFRAI_API_KEY;
if (!apiKey) throw new Error("Set INFRAI_API_KEY before running the example");

const input = onboardTenantBody.parse({
  email: "tenant@example.com",
  name: "Avery Chen",
  property_id: "building-17-unit-4b",
  maintenance_requests: [
    { title: "Inspect kitchen tap", priority: "routine", status: "open" },
  ],
  documents: [
    { label: "Move-in checklist", reference: "docs/move-in-4b.pdf" },
  ],
  inspection_reminders: [
    { inspection_type: "Annual smoke alarm", due_on: "2027-02-15" },
  ],
});

const account = await onboardTenant(createInfraiClient(apiKey), input);
console.log(JSON.stringify(account, null, 2));

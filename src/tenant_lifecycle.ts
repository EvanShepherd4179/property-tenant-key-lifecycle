import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { InfraiTransport } from "./infrai_client.js";

const maintenanceRequest = z.object({
  title: z.string().min(1),
  priority: z.enum(["routine", "urgent"]),
  status: z.enum(["open", "scheduled", "closed"]),
});

const tenantDocument = z.object({
  label: z.string().min(1),
  reference: z.string().min(1),
  expires_on: z.string().date().optional(),
});

const inspectionReminder = z.object({
  inspection_type: z.string().min(1),
  due_on: z.string().date(),
});

export const onboardTenantBody = z.object({
  email: z.string().email(),
  name: z.string().min(1),
  property_id: z.string().min(1),
  maintenance_requests: z.array(maintenanceRequest).default([]),
  documents: z.array(tenantDocument).default([]),
  inspection_reminders: z.array(inspectionReminder).default([]),
  request_id: z.string().uuid().default(() => randomUUID()),
});

export type OnboardTenant = z.infer<typeof onboardTenantBody>;

export type TenantAccount = {
  user_id: string;
  key_id: string;
  property_id: string;
  status: "active" | "offboarded";
};

type CreatedUser = { user_id: string };
type CreatedKey = { id: string; key: string };

export async function onboardTenant(
  infrai: InfraiTransport,
  input: OnboardTenant,
): Promise<TenantAccount & { key: string }> {
  const user = await infrai<CreatedUser>("/v1/auth/user/create", {
    method: "POST",
    body: {
      email: input.email,
      name: input.name,
      metadata: {
        property_id: input.property_id,
        maintenance_requests: input.maintenance_requests,
        documents: input.documents,
        inspection_reminders: input.inspection_reminders,
      },
      idempotency_key: `tenant-user:${input.request_id}`,
    },
  });

  const scopedKey = await infrai<CreatedKey>("/v1/account/keys/create", {
    method: "POST",
    body: {
      project_id: user.user_id,
      name: `property-tenant:${input.property_id}`,
      scopes: ["maintenance:write", "documents:read", "inspections:read"],
      idempotency_key: `tenant-key:${input.request_id}`,
    },
  });

  return {
    user_id: user.user_id,
    key_id: scopedKey.id,
    key: scopedKey.key,
    property_id: input.property_id,
    status: "active",
  };
}

export async function offboardTenant(
  infrai: InfraiTransport,
  account: TenantAccount,
): Promise<TenantAccount> {
  await Promise.all([
    infrai<unknown>(`/v1/auth/user/delete/${encodeURIComponent(account.user_id)}`, {
      method: "DELETE",
    }),
    infrai<unknown>(`/v1/account/keys/revoke/${encodeURIComponent(account.key_id)}`, {
      method: "DELETE",
    }),
  ]);

  return { ...account, status: "offboarded" };
}

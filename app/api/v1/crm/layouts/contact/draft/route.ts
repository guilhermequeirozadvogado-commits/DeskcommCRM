/**
 * PUT /api/v1/crm/layouts/contact/draft — salva o rascunho do layout (admin),
 * com CAS: o UPDATE só aplica quando `draft_revision` ainda é a que a tela leu.
 * Zero linhas afetadas = alguém salvou antes → 409 `model_conflict`, e a ação
 * de quem recebe é recarregar e comparar — nunca repetir por cima.
 */
import { randomUUID } from "node:crypto";

import type { NextRequest } from "next/server";

import { fail, ok } from "@/lib/api/wrappers";
import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth/require-role";
import { layoutDocumentSchema } from "@/lib/crm-fields/layout-schema";
import { salvarRascunhoSchema } from "@/lib/crm-fields/schemas";
import { traduzir } from "@/lib/i18n/dicionario";
import { requireSupportWrite } from "@/lib/impersonate/support";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function PUT(req: NextRequest): Promise<Response> {
  const negado = await requireSupportWrite();
  if (negado) return negado;

  const requestId = randomUUID();
  const authz = await requireRole("admin", { requestId, resource: "crm_fields" });
  if (!authz.ok) return authz.response;
  const t = (texto: string) => traduzir(texto, authz.user.idioma);

  const cru = (await req.json().catch(() => null)) as { document?: unknown } | null;
  const meta = salvarRascunhoSchema.safeParse(cru);
  const documento = layoutDocumentSchema.safeParse(cru?.document);
  if (!meta.success || !documento.success) {
    return fail("validation_failed", t("Dados inválidos."), 422, {
      requestId,
      details: {
        ...(meta.success ? {} : (meta.error.flatten().fieldErrors as Record<string, unknown>)),
        ...(documento.success ? {} : { document: documento.error.issues.map((i) => i.message) }),
      },
    });
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("crm_record_layouts")
    .update({
      draft_document: documento.data,
      draft_revision: meta.data.expected_draft_revision + 1,
      updated_by: authz.user.id,
      updated_at: new Date().toISOString(),
    })
    .eq("organization_id", authz.org.orgId)
    .eq("entity_kind", "contact")
    .eq("draft_revision", meta.data.expected_draft_revision)
    .select("id, draft_revision");
  if (error) return fail("internal_error", error.message, 500, { requestId });

  if (!data || data.length === 0) {
    const { data: atual } = await admin
      .from("crm_record_layouts")
      .select("id, draft_revision")
      .eq("organization_id", authz.org.orgId)
      .eq("entity_kind", "contact")
      .maybeSingle();
    if (!atual) return fail("not_found", t("A ficha ainda não foi personalizada — faça o bootstrap."), 404, { requestId });
    return fail("model_conflict", t("Outra pessoa salvou o rascunho depois de você abrir — recarregue."), 409, {
      requestId,
      details: { draft_revision: (atual as { draft_revision: number }).draft_revision },
    });
  }

  void audit({
    action: "crm_layout.draft_saved",
    actorUserId: authz.user.id,
    organizationId: authz.org.orgId,
    resourceType: "crm_record_layout",
    resourceId: (data[0] as { id: string }).id,
    requestId,
    metadata: { draft_revision: (data[0] as { draft_revision: number }).draft_revision },
  });

  return ok({ draft_revision: (data[0] as { draft_revision: number }).draft_revision }, { requestId });
}

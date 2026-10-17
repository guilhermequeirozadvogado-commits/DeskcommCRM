/**
 * POST /api/v1/crm/layouts/contact/publish — publica o layout (admin).
 *
 * Duas validações antes do banco: a FORMA (Zod) e a REFERÊNCIA (todo field_id
 * existe, é de contato e está ativo — 422 `layout_invalid` com a lista). A
 * publicação em si é a RPC `fn_publish_record_layout`, que tranca o ponteiro,
 * compara a release esperada (divergiu → 409 `model_conflict`), insere o
 * snapshot imutável e troca o ponteiro numa transação só.
 */
import { randomUUID } from "node:crypto";

import type { NextRequest } from "next/server";

import { fail, ok } from "@/lib/api/wrappers";
import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth/require-role";
import { layoutDocumentSchema, validarParaPublicar } from "@/lib/crm-fields/layout-schema";
import { publicarSchema } from "@/lib/crm-fields/schemas";
import { traduzir } from "@/lib/i18n/dicionario";
import { requireSupportWrite } from "@/lib/impersonate/support";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest): Promise<Response> {
  const negado = await requireSupportWrite();
  if (negado) return negado;

  const requestId = randomUUID();
  const authz = await requireRole("admin", { requestId, resource: "crm_fields" });
  if (!authz.ok) return authz.response;
  const t = (texto: string) => traduzir(texto, authz.user.idioma);

  const cru = (await req.json().catch(() => null)) as { document?: unknown } | null;
  const meta = publicarSchema.safeParse(cru);
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
  const orgId = authz.org.orgId;

  const [{ data: layout, error: erroLayout }, { data: definicoes, error: erroDefs }] = await Promise.all([
    admin
      .from("crm_record_layouts")
      .select("id")
      .eq("organization_id", orgId)
      .eq("entity_kind", "contact")
      .maybeSingle(),
    admin
      .from("crm_field_definitions")
      .select("id, entity_kind, lifecycle")
      .eq("organization_id", orgId)
      .eq("entity_kind", "contact"),
  ]);
  if (erroLayout) return fail("internal_error", erroLayout.message, 500, { requestId });
  if (erroDefs) return fail("internal_error", erroDefs.message, 500, { requestId });
  if (!layout) {
    return fail("not_found", t("A ficha ainda não foi personalizada — faça o bootstrap."), 404, { requestId });
  }

  const referencia = validarParaPublicar(
    documento.data,
    (definicoes ?? []) as { id: string; entity_kind: "contact" | "lead"; lifecycle: "active" | "archived" }[],
  );
  if (!referencia.ok) {
    return fail("layout_invalid", t("O layout cita campos inexistentes ou arquivados."), 422, {
      requestId,
      details: { field_ids: referencia.fieldIds },
    });
  }

  const { data: releaseId, error } = await admin.rpc("fn_publish_record_layout", {
    p_org: orgId,
    p_layout: layout.id as string,
    p_document: documento.data,
    p_expected_release: meta.data.expected_release_id,
    p_actor: authz.user.id,
  });
  if (error) {
    if (error.code === "55000" || /release ativa divergente/.test(error.message)) {
      return fail("model_conflict", t("Alguém publicou outra versão depois de você abrir — recarregue e compare."), 409, {
        requestId,
      });
    }
    if (error.code === "P0002" || /layout não encontrado/.test(error.message)) {
      return fail("not_found", t("A ficha ainda não foi personalizada — faça o bootstrap."), 404, { requestId });
    }
    return fail("internal_error", error.message, 500, { requestId });
  }

  void audit({
    action: "crm_layout.published",
    actorUserId: authz.user.id,
    organizationId: orgId,
    resourceType: "crm_record_layout",
    resourceId: layout.id as string,
    requestId,
    metadata: { release_id: releaseId as string },
  });

  return ok({ release_id: releaseId as string }, { requestId, status: 201 });
}

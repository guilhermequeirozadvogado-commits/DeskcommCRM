/**
 * PATCH /api/v1/crm/fields/[id] — renomeia rótulo/dica, mexe nas opções ou
 * arquiva/desarquiva uma definição (admin).
 *
 * O contrato de imutabilidade mora aqui: `api_key`, `storage_key`, `field_type`,
 * `entity_kind` e `native_binding` não mudam nunca (tentar → 422
 * `field_immutable`), e opção existente não troca de id nem some do array —
 * renomeia o rótulo ou arquiva. É o que garante que renomear jamais órfã um
 * valor gravado.
 */
import { randomUUID } from "node:crypto";

import type { NextRequest } from "next/server";

import { fail, ok } from "@/lib/api/wrappers";
import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth/require-role";
import { CHAVES_IMUTAVEIS, editarCampoSchema } from "@/lib/crm-fields/schemas";
import type { FieldOption } from "@/lib/crm-fields/tipos";
import { traduzir } from "@/lib/i18n/dicionario";
import { requireSupportWrite } from "@/lib/impersonate/support";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const COLUNAS =
  "id, entity_kind, api_key, storage_key, native_binding, field_type, label, hint, options, lifecycle, seeded_from, created_at, updated_at, archived_at";

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  const negado = await requireSupportWrite();
  if (negado) return negado;

  const requestId = randomUUID();
  const authz = await requireRole("admin", { requestId, resource: "crm_fields" });
  if (!authz.ok) return authz.response;
  const t = (texto: string) => traduzir(texto, authz.user.idioma);

  const { id } = await ctx.params;
  const cru = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (cru && typeof cru === "object") {
    const imutavel = CHAVES_IMUTAVEIS.find((k) => k in cru);
    if (imutavel) {
      return fail("field_immutable", t("Este atributo do campo não muda depois de criado."), 422, {
        requestId,
        details: { atributo: imutavel },
      });
    }
  }
  const parsed = editarCampoSchema.safeParse(cru);
  if (!parsed.success) {
    return fail("validation_failed", t("Dados inválidos."), 422, {
      requestId,
      details: parsed.error.flatten().fieldErrors as Record<string, unknown>,
    });
  }
  const body = parsed.data;

  const admin = createAdminClient();
  const { data: atual, error: erroLeitura } = await admin
    .from("crm_field_definitions")
    .select(COLUNAS)
    .eq("organization_id", authz.org.orgId)
    .eq("id", id)
    .maybeSingle();
  if (erroLeitura) return fail("internal_error", erroLeitura.message, 500, { requestId });
  if (!atual) return fail("not_found", t("Campo não encontrado."), 404, { requestId });

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.label !== undefined) patch.label = body.label;
  if (body.hint !== undefined) patch.hint = body.hint ?? null;

  if (body.options !== undefined) {
    const existentes = (atual as { options: FieldOption[] }).options ?? [];
    const novasPorId = new Map(body.options.map((o) => [o.id, o]));
    if (novasPorId.size !== body.options.length) {
      return fail("validation_failed", t("Opções com a mesma chave."), 422, { requestId });
    }
    const sumiu = existentes.find((o) => !novasPorId.has(o.id));
    if (sumiu) {
      return fail("field_immutable", t("Opção existente não some — renomeie o rótulo ou arquive."), 422, {
        requestId,
        details: { option_id: sumiu.id },
      });
    }
    patch.options = body.options.map((o) => ({
      id: o.id,
      label: o.label,
      ...(o.archived ? { archived: true } : {}),
    }));
  }

  if (body.lifecycle !== undefined && body.lifecycle !== (atual as { lifecycle: string }).lifecycle) {
    patch.lifecycle = body.lifecycle;
    patch.archived_at = body.lifecycle === "archived" ? new Date().toISOString() : null;
  }

  const { data, error } = await admin
    .from("crm_field_definitions")
    .update(patch)
    .eq("organization_id", authz.org.orgId)
    .eq("id", id)
    .select(COLUNAS)
    .single();
  if (error) return fail("internal_error", error.message, 500, { requestId });

  void audit({
    action: patch.lifecycle === "archived" ? "crm_field.archived" : "crm_field.updated",
    actorUserId: authz.user.id,
    organizationId: authz.org.orgId,
    resourceType: "crm_field_definition",
    resourceId: id,
    requestId,
    metadata: { atributos: Object.keys(patch).filter((k) => k !== "updated_at") },
  });

  return ok({ field: data }, { requestId });
}

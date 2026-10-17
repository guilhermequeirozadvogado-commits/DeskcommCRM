/**
 * GET  /api/v1/crm/fields?entity_kind=contact — o catálogo de campos da organização (admin).
 * POST /api/v1/crm/fields — cria uma definição (admin).
 *
 * A identidade (id, api_key) e o binding (storage_key) nascem aqui e nunca
 * mudam; renomear é PATCH de rótulo em /crm/fields/[id]. A escrita é sempre do
 * servidor (as tabelas são select-only para authenticated), com a organização
 * resolvida da sessão — nunca do body.
 */
import { randomUUID } from "node:crypto";

import type { NextRequest } from "next/server";

import { fail, ok } from "@/lib/api/wrappers";
import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth/require-role";
import { API_KEY_REGEX, apiKeyDoRotulo, criarCampoSchema, optionIdDoRotulo } from "@/lib/crm-fields/schemas";
import { MAX_CAMPOS_POR_ENTIDADE, PREFIXO_RESERVADO_DE_LINKS, type FieldOption } from "@/lib/crm-fields/tipos";
import { traduzir } from "@/lib/i18n/dicionario";
import { requireSupportWrite } from "@/lib/impersonate/support";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const COLUNAS =
  "id, entity_kind, api_key, storage_key, native_binding, field_type, label, hint, options, lifecycle, seeded_from, created_at, updated_at, archived_at";

export async function GET(req: NextRequest): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("admin", { requestId, resource: "crm_fields" });
  if (!authz.ok) return authz.response;

  const entityKind = req.nextUrl.searchParams.get("entity_kind") ?? "contact";
  if (entityKind !== "contact") {
    return fail("validation_failed", "entity_kind inválido.", 422, { requestId });
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("crm_field_definitions")
    .select(COLUNAS)
    .eq("organization_id", authz.org.orgId)
    .eq("entity_kind", entityKind)
    .order("created_at", { ascending: true });
  if (error) return fail("internal_error", error.message, 500, { requestId });

  return ok({ fields: data ?? [] }, { requestId });
}

export async function POST(req: NextRequest): Promise<Response> {
  const negado = await requireSupportWrite();
  if (negado) return negado;

  const requestId = randomUUID();
  const authz = await requireRole("admin", { requestId, resource: "crm_fields" });
  if (!authz.ok) return authz.response;
  const t = (texto: string) => traduzir(texto, authz.user.idioma);

  const parsed = criarCampoSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return fail("validation_failed", t("Dados inválidos."), 422, {
      requestId,
      details: parsed.error.flatten().fieldErrors as Record<string, unknown>,
    });
  }
  const body = parsed.data;

  const apiKey = body.api_key ?? apiKeyDoRotulo(body.label);
  if (!API_KEY_REGEX.test(apiKey)) {
    return fail("validation_failed", t("A chave gerada do rótulo ficou inválida — informe api_key."), 422, {
      requestId,
    });
  }
  const storageKey = `ficha_${apiKey}`;
  if (storageKey.startsWith(`ficha_${PREFIXO_RESERVADO_DE_LINKS}`)) {
    return fail("validation_failed", t("Esta chave é reservada."), 422, { requestId });
  }

  // Opções: id estável desde o nascimento; sem repetição.
  const options: FieldOption[] = [];
  for (const o of body.options ?? []) {
    const id = o.id ?? optionIdDoRotulo(o.label);
    if (options.some((x) => x.id === id)) {
      return fail("validation_failed", t("Opções com a mesma chave."), 422, {
        requestId,
        details: { option_id: id },
      });
    }
    options.push({ id, label: o.label });
  }
  if (body.field_type === "select" && options.length === 0) {
    return fail("validation_failed", t("Campo de lista precisa de ao menos uma opção."), 422, { requestId });
  }

  const admin = createAdminClient();

  const { count, error: erroContagem } = await admin
    .from("crm_field_definitions")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", authz.org.orgId)
    .eq("entity_kind", body.entity_kind)
    .eq("lifecycle", "active");
  if (erroContagem) return fail("internal_error", erroContagem.message, 500, { requestId });
  if ((count ?? 0) >= MAX_CAMPOS_POR_ENTIDADE) {
    return fail("validation_failed", t("A organização já tem o máximo de campos ativos."), 422, {
      requestId,
      details: { max: MAX_CAMPOS_POR_ENTIDADE },
    });
  }

  const { data, error } = await admin
    .from("crm_field_definitions")
    .insert({
      organization_id: authz.org.orgId,
      entity_kind: body.entity_kind,
      api_key: apiKey,
      storage_key: storageKey,
      field_type: body.field_type,
      label: body.label,
      hint: body.hint ?? null,
      options,
      created_by: authz.user.id,
    })
    .select(COLUNAS)
    .single();
  if (error) {
    if (error.code === "23505") {
      return fail("field_key_taken", t("Já existe um campo com esta chave."), 409, {
        requestId,
        details: { api_key: apiKey },
      });
    }
    return fail("internal_error", error.message, 500, { requestId });
  }

  void audit({
    action: "crm_field.created",
    actorUserId: authz.user.id,
    organizationId: authz.org.orgId,
    resourceType: "crm_field_definition",
    resourceId: (data as { id: string }).id,
    requestId,
    metadata: { api_key: apiKey, field_type: body.field_type },
  });

  return ok({ field: data }, { requestId, status: 201 });
}

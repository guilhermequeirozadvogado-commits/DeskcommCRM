/**
 * POST /api/v1/crm/layouts/contact/bootstrap — semeia o catálogo e o rascunho
 * inicial a partir da ficha fixa do código (admin). Idempotente: definição que
 * já existe fica como está (conflito em (org, entity_kind, api_key) ignora), e
 * layout que já existe não é tocado. É o "Começar a personalizar" da tela.
 */
import { randomUUID } from "node:crypto";

import { fail, ok } from "@/lib/api/wrappers";
import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth/require-role";
import { definicoesDoSeed, documentoDoSeed } from "@/lib/crm-fields/padrao-do-contato";
import { traduzir } from "@/lib/i18n/dicionario";
import { requireSupportWrite } from "@/lib/impersonate/support";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function POST(): Promise<Response> {
  const negado = await requireSupportWrite();
  if (negado) return negado;

  const requestId = randomUUID();
  const authz = await requireRole("admin", { requestId, resource: "crm_fields" });
  if (!authz.ok) return authz.response;
  const t = (texto: string) => traduzir(texto, authz.user.idioma);

  const admin = createAdminClient();
  const orgId = authz.org.orgId;

  // 1. Semeia as definições; as que já existem (mesma api_key) ficam como estão.
  const seed = definicoesDoSeed().map((d) => ({
    organization_id: orgId,
    entity_kind: d.entity_kind,
    api_key: d.api_key,
    storage_key: d.storage_key,
    native_binding: d.native_binding,
    field_type: d.field_type,
    label: d.label,
    hint: d.hint,
    options: d.options,
    seeded_from: d.seeded_from,
    created_by: authz.user.id,
  }));
  const { error: erroSeed } = await admin
    .from("crm_field_definitions")
    .upsert(seed, { onConflict: "organization_id,entity_kind,api_key", ignoreDuplicates: true });
  if (erroSeed) return fail("internal_error", erroSeed.message, 500, { requestId });

  // 2. Monta o documento com os ids REAIS (os UUIDs nasceram no banco).
  const { data: definicoes, error: erroDefs } = await admin
    .from("crm_field_definitions")
    .select("id, storage_key")
    .eq("organization_id", orgId)
    .eq("entity_kind", "contact");
  if (erroDefs) return fail("internal_error", erroDefs.message, 500, { requestId });
  const idPorChave = new Map(
    ((definicoes ?? []) as { id: string; storage_key: string }[]).map((d) => [d.storage_key, d.id]),
  );
  let documento;
  try {
    documento = documentoDoSeed(idPorChave);
  } catch {
    return fail("internal_error", t("O seed do catálogo ficou incompleto — tente de novo."), 500, { requestId });
  }

  // 3. Cria o ponteiro com o rascunho semeado, se ainda não existe.
  const { data: existente, error: erroLeitura } = await admin
    .from("crm_record_layouts")
    .select("id, draft_revision, active_release_id")
    .eq("organization_id", orgId)
    .eq("entity_kind", "contact")
    .maybeSingle();
  if (erroLeitura) return fail("internal_error", erroLeitura.message, 500, { requestId });

  if (!existente) {
    const { error: erroInsert } = await admin.from("crm_record_layouts").insert({
      organization_id: orgId,
      entity_kind: "contact",
      draft_document: documento,
      draft_base_release_id: null,
      updated_by: authz.user.id,
    });
    // Corrida entre dois admins: o segundo perde para a unique e segue — o
    // bootstrap é idempotente por definição.
    if (erroInsert && erroInsert.code !== "23505") {
      return fail("internal_error", erroInsert.message, 500, { requestId });
    }
    void audit({
      action: "crm_layout.bootstrapped",
      actorUserId: authz.user.id,
      organizationId: orgId,
      resourceType: "crm_record_layout",
      resourceId: orgId,
      requestId,
      metadata: { definicoes: seed.length },
    });
  }

  return ok({ bootstrapped: !existente }, { requestId, status: existente ? 200 : 201 });
}

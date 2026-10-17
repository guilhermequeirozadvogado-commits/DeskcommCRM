/**
 * GET /api/v1/crm/layouts/contact — a carga do EDITOR de layout (admin):
 * ponteiro com rascunho e revisão, release ativa com documento, histórico das
 * últimas releases e o catálogo de campos. `layout: null` significa que a
 * organização nunca fez bootstrap — a tela oferece "Começar a personalizar".
 */
import { randomUUID } from "node:crypto";

import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const COLUNAS_DO_CATALOGO =
  "id, entity_kind, api_key, storage_key, native_binding, field_type, label, hint, options, lifecycle, seeded_from, created_at, updated_at, archived_at";

export async function GET(): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("admin", { requestId, resource: "crm_fields" });
  if (!authz.ok) return authz.response;

  const admin = createAdminClient();
  const [{ data: layout, error: erroLayout }, { data: definicoes, error: erroDefs }] = await Promise.all([
    admin
      .from("crm_record_layouts")
      .select("id, entity_kind, draft_document, draft_revision, draft_base_release_id, active_release_id, updated_at")
      .eq("organization_id", authz.org.orgId)
      .eq("entity_kind", "contact")
      .maybeSingle(),
    admin
      .from("crm_field_definitions")
      .select(COLUNAS_DO_CATALOGO)
      .eq("organization_id", authz.org.orgId)
      .eq("entity_kind", "contact")
      .order("created_at", { ascending: true }),
  ]);
  if (erroLayout) return fail("internal_error", erroLayout.message, 500, { requestId });
  if (erroDefs) return fail("internal_error", erroDefs.message, 500, { requestId });

  let releaseAtiva: unknown = null;
  let historico: unknown[] = [];
  if (layout) {
    const [{ data: ativa, error: erroAtiva }, { data: releases, error: erroHist }] = await Promise.all([
      layout.active_release_id
        ? admin
            .from("crm_record_layout_releases")
            .select("id, version, document, created_at")
            .eq("organization_id", authz.org.orgId)
            .eq("id", layout.active_release_id as string)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null } as const),
      admin
        .from("crm_record_layout_releases")
        .select("id, version, created_at, created_by")
        .eq("organization_id", authz.org.orgId)
        .eq("layout_id", layout.id as string)
        .order("version", { ascending: false })
        .limit(10),
    ]);
    if (erroAtiva) return fail("internal_error", erroAtiva.message, 500, { requestId });
    if (erroHist) return fail("internal_error", erroHist.message, 500, { requestId });
    releaseAtiva = ativa ?? null;
    historico = releases ?? [];
  }

  return ok(
    { layout: layout ?? null, release_ativa: releaseAtiva, historico, fields: definicoes ?? [] },
    { requestId },
  );
}

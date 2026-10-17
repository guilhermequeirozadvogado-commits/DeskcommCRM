/**
 * POST /api/v1/crm/layouts/contact/bootstrap — cria o layout da ficha do contato
 * com um rascunho em branco (uma aba, nenhum grupo), para quem administra montar
 * a ficha pela tela. É o "Começar a personalizar". Idempotente: layout que já
 * existe não é tocado — inclusive o das organizações que começaram quando o
 * bootstrap ainda copiava a ficha fixa do código.
 */
import { randomUUID } from "node:crypto";

import { fail, ok } from "@/lib/api/wrappers";
import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth/require-role";
import { documentoInicial } from "@/lib/crm-fields/padrao-do-contato";
import { requireSupportWrite } from "@/lib/impersonate/support";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function POST(): Promise<Response> {
  const negado = await requireSupportWrite();
  if (negado) return negado;

  const requestId = randomUUID();
  const authz = await requireRole("admin", { requestId, resource: "crm_fields" });
  if (!authz.ok) return authz.response;

  const admin = createAdminClient();
  const orgId = authz.org.orgId;

  // Cria o ponteiro com o rascunho em branco, se ainda não existe.
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
      draft_document: documentoInicial(),
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
      metadata: { rascunho: "em_branco" },
    });
  }

  return ok({ bootstrapped: !existente }, { requestId, status: existente ? 200 : 201 });
}

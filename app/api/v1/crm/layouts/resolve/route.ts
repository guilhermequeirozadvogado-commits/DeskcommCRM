/**
 * GET /api/v1/crm/layouts/resolve?entity_kind=contact — o modelo EFETIVO da
 * ficha para a organização ativa: a release publicada composta com o catálogo,
 * ou o modelo vazio quando nunca houve publicação. Falha de leitura é 500 — a
 * tela mostra "tentar de novo", nunca uma ficha substituta.
 *
 * Qualquer membro lê (viewer+): é o que a ficha do contato renderiza. Nunca
 * devolve VALORES de registros — só metadados de apresentação.
 */
import { randomUUID } from "node:crypto";

import type { NextRequest } from "next/server";

import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { FalhaAoResolverFicha, resolverModeloDoContato } from "@/lib/crm-fields/resolvedor";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("viewer", { requestId, resource: "crm_fields" });
  if (!authz.ok) return authz.response;

  const entityKind = req.nextUrl.searchParams.get("entity_kind") ?? "contact";
  if (entityKind !== "contact") {
    return fail("validation_failed", "entity_kind inválido.", 422, { requestId });
  }

  try {
    const modelo = await resolverModeloDoContato(createAdminClient(), authz.org.orgId);
    return ok({ modelo, release_id: modelo.releaseId }, { requestId });
  } catch (e) {
    if (e instanceof FalhaAoResolverFicha) {
      return fail("internal_error", "Não foi possível carregar a ficha.", 500, { requestId });
    }
    throw e;
  }
}

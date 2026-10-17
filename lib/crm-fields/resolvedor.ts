/**
 * Resolve o modelo EFETIVO da ficha do contato de uma organização: a release
 * publicada composta com o catálogo — ou, sem publicação, o modelo padrão do
 * código. Roda no servidor (recebe o admin client e filtra a organização
 * explicitamente; o chamador é quem autentica).
 *
 * Decisões de composição, todas na direção de "a ficha nunca quebra":
 * - ponteiro ausente, release ausente ou erro de leitura → modelo padrão;
 * - `field_id` sem definição (apagada por fora) → campo pulado;
 * - tipo sem renderização na ficha (`boolean`/`multiselect`) → campo pulado;
 * - definição arquivada → campo entra marcado `arquivado` (a tela mostra o
 *   valor preenchido somente leitura e esconde o vazio);
 * - condição `visivelQuando` apontando para definição sumida → condição cai e
 *   o grupo fica visível (esconder por referência quebrada esconderia dado).
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { modeloPadraoDoContato } from "./padrao-do-contato";
import {
  tipoDaFicha,
  type FieldDefinition,
  type FieldOption,
  type LayoutDocumentV1,
  type ModeloDaFicha,
} from "./tipos";

interface LinhaDeDefinicao {
  id: string;
  entity_kind: string;
  api_key: string;
  storage_key: string;
  native_binding: string | null;
  field_type: string;
  label: string;
  hint: string | null;
  options: unknown;
  lifecycle: string;
}

function opcoesDaLinha(options: unknown): FieldOption[] | undefined {
  if (!Array.isArray(options) || options.length === 0) return undefined;
  const limpas = options.filter(
    (o): o is FieldOption =>
      typeof o === "object" && o !== null && typeof (o as FieldOption).id === "string" &&
      typeof (o as FieldOption).label === "string",
  );
  return limpas.length > 0 ? limpas : undefined;
}

/** Compõe documento + catálogo num modelo renderizável. Pura, para testar. */
export function comporModelo(
  documento: LayoutDocumentV1,
  definicoes: LinhaDeDefinicao[],
  releaseId: string,
): ModeloDaFicha {
  const porId = new Map(definicoes.map((d) => [d.id, d]));
  return {
    releaseId,
    abas: documento.abas.map((aba) => ({
      id: aba.id,
      titulo: aba.titulo,
      grupos: aba.grupos.map((grupo) => {
        const condicao = grupo.visivelQuando ? porId.get(grupo.visivelQuando.field_id) : undefined;
        return {
          id: grupo.id,
          titulo: grupo.titulo,
          ...(grupo.recolhido ? { recolhido: true } : {}),
          ...(grupo.contarPreenchidos ? { contarPreenchidos: true } : {}),
          ...(grupo.visivelQuando && condicao
            ? { visivelQuando: { chave: condicao.storage_key, valores: grupo.visivelQuando.valores } }
            : {}),
          campos: grupo.campos.flatMap((campo) => {
            const def = porId.get(campo.field_id);
            if (!def) return [];
            const tipo = tipoDaFicha(def.field_type as FieldDefinition["field_type"]);
            if (!tipo) return [];
            const opcoes = opcoesDaLinha(def.options);
            return [
              {
                fieldId: def.id,
                chave: def.storage_key,
                rotulo: def.label,
                tipo,
                ...(opcoes ? { opcoes } : {}),
                ...(def.native_binding ? { nativo: def.native_binding as "cpf" | "birthdate" | "email" } : {}),
                ...(def.hint ? { dica: def.hint } : {}),
                ...(campo.destaque ? { destaque: true } : {}),
                ...(campo.largura ? { largura: campo.largura } : {}),
                ...(def.lifecycle === "archived" ? { arquivado: true } : {}),
              },
            ];
          }),
        };
      }),
    })),
  };
}

export async function resolverModeloDoContato(
  admin: SupabaseClient,
  orgId: string,
): Promise<ModeloDaFicha> {
  const { data: ponteiro, error } = await admin
    .from("crm_record_layouts")
    .select("id, active_release_id")
    .eq("organization_id", orgId)
    .eq("entity_kind", "contact")
    .maybeSingle();
  if (error || !ponteiro?.active_release_id) return modeloPadraoDoContato();

  const [{ data: release, error: erroRelease }, { data: definicoes, error: erroDefs }] = await Promise.all([
    admin
      .from("crm_record_layout_releases")
      .select("id, document")
      .eq("organization_id", orgId)
      .eq("id", ponteiro.active_release_id as string)
      .maybeSingle(),
    admin
      .from("crm_field_definitions")
      .select("id, entity_kind, api_key, storage_key, native_binding, field_type, label, hint, options, lifecycle")
      .eq("organization_id", orgId)
      .eq("entity_kind", "contact"),
  ]);
  if (erroRelease || erroDefs || !release?.document) return modeloPadraoDoContato();

  return comporModelo(
    release.document as LayoutDocumentV1,
    (definicoes ?? []) as LinhaDeDefinicao[],
    release.id as string,
  );
}

/** As chaves de campos protegidos do modelo resolvido (espelha `chavesProtegidas`). */
export function chavesProtegidasDoModelo(modelo: ModeloDaFicha): Set<string> {
  return new Set(
    modelo.abas.flatMap((a) => a.grupos.flatMap((g) => g.campos.filter((c) => c.tipo === "protegido").map((c) => c.chave))),
  );
}

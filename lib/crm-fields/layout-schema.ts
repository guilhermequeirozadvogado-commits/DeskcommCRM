/**
 * Validação do documento de layout (`LayoutDocumentV1`).
 *
 * Duas camadas de propósito: o Zod valida a FORMA (qualquer rota que receba um
 * documento passa por ele), e `validarParaPublicar` valida a REFERÊNCIA — todo
 * `field_id` citado existe na organização, é da entidade certa e está ativo.
 * Publicar com referência quebrada é o que produziria ficha com buraco em todo
 * mundo; por isso a segunda camada roda só na publicação, contra o catálogo
 * carregado do banco, e devolve a lista exata dos ids problemáticos para a
 * tela destacar.
 */

import { z } from "zod";

import type { FieldDefinition, LayoutDocumentV1 } from "./tipos";

const ID_DE_NO = /^[a-z][a-z0-9_-]{0,40}$/;

export const LIMITES_DO_LAYOUT = {
  abas: 5,
  grupos: 30,
  campos: 100,
} as const;

const layoutCampoSchema = z.object({
  field_id: z.string().uuid(),
  largura: z.union([z.literal(1), z.literal(2)]).optional(),
  destaque: z.boolean().optional(),
});

const layoutGrupoSchema = z.object({
  id: z.string().regex(ID_DE_NO),
  titulo: z.string().trim().min(1).max(80),
  recolhido: z.boolean().optional(),
  contarPreenchidos: z.boolean().optional(),
  visivelQuando: z
    .object({
      field_id: z.string().uuid(),
      valores: z.array(z.string().min(1).max(80)).min(1).max(20),
    })
    .optional(),
  campos: z.array(layoutCampoSchema),
});

const layoutAbaSchema = z.object({
  id: z.string().regex(ID_DE_NO),
  titulo: z.string().trim().min(1).max(80),
  grupos: z.array(layoutGrupoSchema),
});

export const layoutDocumentSchema = z
  .object({
    version: z.literal(1),
    abas: z.array(layoutAbaSchema).min(1).max(LIMITES_DO_LAYOUT.abas),
  })
  .superRefine((doc, ctx) => {
    const idsDeNo = new Set<string>();
    const fieldIds = new Set<string>();
    let grupos = 0;
    let campos = 0;
    for (const aba of doc.abas) {
      if (idsDeNo.has(aba.id)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `id de aba repetido: ${aba.id}` });
      }
      idsDeNo.add(aba.id);
      for (const grupo of aba.grupos) {
        grupos += 1;
        if (idsDeNo.has(grupo.id)) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: `id de grupo repetido: ${grupo.id}` });
        }
        idsDeNo.add(grupo.id);
        for (const campo of grupo.campos) {
          campos += 1;
          if (fieldIds.has(campo.field_id)) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: `campo referenciado duas vezes no layout: ${campo.field_id}`,
            });
          }
          fieldIds.add(campo.field_id);
        }
      }
    }
    if (grupos > LIMITES_DO_LAYOUT.grupos) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `mais de ${LIMITES_DO_LAYOUT.grupos} grupos` });
    }
    if (campos > LIMITES_DO_LAYOUT.campos) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `mais de ${LIMITES_DO_LAYOUT.campos} campos` });
    }
  });

export type ResultadoDaPublicacao =
  | { ok: true }
  | {
      ok: false;
      /** Ids citados no documento que não existem, são de outra entidade ou estão arquivados. */
      fieldIds: string[];
    };

/**
 * Toda referência do documento (campos E condições `visivelQuando`) precisa
 * apontar para definição existente, da mesma entidade e ativa. O catálogo vem
 * do banco, já filtrado pela organização — esta função não decide tenancy.
 */
export function validarParaPublicar(
  doc: LayoutDocumentV1,
  definicoes: Pick<FieldDefinition, "id" | "entity_kind" | "lifecycle">[],
  entityKind: FieldDefinition["entity_kind"] = "contact",
): ResultadoDaPublicacao {
  const ativas = new Set(
    definicoes.filter((d) => d.entity_kind === entityKind && d.lifecycle === "active").map((d) => d.id),
  );
  const problema = new Set<string>();
  for (const aba of doc.abas) {
    for (const grupo of aba.grupos) {
      if (grupo.visivelQuando && !ativas.has(grupo.visivelQuando.field_id)) {
        problema.add(grupo.visivelQuando.field_id);
      }
      for (const campo of grupo.campos) {
        if (!ativas.has(campo.field_id)) problema.add(campo.field_id);
      }
    }
  }
  return problema.size === 0 ? { ok: true } : { ok: false, fieldIds: [...problema] };
}

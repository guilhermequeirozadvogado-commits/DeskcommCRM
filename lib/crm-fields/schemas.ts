/**
 * Schemas Zod das rotas do catálogo de campos. Vivem no módulo (como
 * `lib/campanhas/configuracao`) para o contrato inteiro morar num lugar só.
 *
 * Decisões de contrato:
 * - `api_key` pode vir do cliente (editável ANTES de criar) ou ser derivada do
 *   rótulo pelo servidor; depois de criada é imutável.
 * - Opções: o id é estável — criar manda `label` (e opcionalmente `id`); editar
 *   só renomeia `label` ou arquiva. Opção existente não pode SUMIR do array
 *   (arquivar é o caminho), senão renomear-por-remoção viraria porta de troca
 *   de id.
 * - O PATCH recusa as chaves imutáveis com `field_immutable` (não um genérico
 *   `validation_failed`): quem integrou precisa saber que o atributo existe e
 *   não muda, não que o body está "inválido".
 */

import { z } from "zod";

import { TIPOS_OFERTADOS } from "./tipos";

export const API_KEY_REGEX = /^[a-z][a-z0-9_]{0,62}$/;
const OPTION_ID_REGEX = /^[a-z0-9][a-z0-9_-]{0,62}$/;

export const CHAVES_IMUTAVEIS = ["api_key", "storage_key", "field_type", "entity_kind", "native_binding"] as const;

const opcaoNovaSchema = z.object({
  id: z.string().regex(OPTION_ID_REGEX).optional(),
  label: z.string().trim().min(1).max(80),
});

const opcaoEditadaSchema = z.object({
  /** Na edição o id é obrigatório e imutável; "RMC/RCC" do seed também passa. */
  id: z.string().min(1).max(80),
  label: z.string().trim().min(1).max(80),
  archived: z.boolean().optional(),
});

export const criarCampoSchema = z.object({
  entity_kind: z.literal("contact"),
  label: z.string().trim().min(1).max(80),
  field_type: z.enum(TIPOS_OFERTADOS as [string, ...string[]]),
  api_key: z.string().regex(API_KEY_REGEX).optional(),
  hint: z.string().trim().max(200).nullish(),
  options: z.array(opcaoNovaSchema).max(50).optional(),
});

export const editarCampoSchema = z.object({
  label: z.string().trim().min(1).max(80).optional(),
  hint: z.string().trim().max(200).nullish(),
  options: z.array(opcaoEditadaSchema).max(50).optional(),
  lifecycle: z.enum(["active", "archived"]).optional(),
});

export const salvarRascunhoSchema = z.object({
  expected_draft_revision: z.number().int().min(0),
});

export const publicarSchema = z.object({
  expected_release_id: z.string().uuid().nullable(),
});

/** "Valor da parcela" → "valor_da_parcela". */
export function apiKeyDoRotulo(label: string): string {
  const chave = label
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/^[0-9]+/, "")
    .slice(0, 48);
  return chave || "campo";
}

/** "Banco Exemplo" (opção) → "banco-exemplo". */
export function optionIdDoRotulo(label: string): string {
  const id = label
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return id || "opcao";
}

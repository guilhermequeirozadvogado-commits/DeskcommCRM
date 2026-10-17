/**
 * Catálogo de campos com identidade estável + layout publicável da ficha.
 *
 * A peça resolve o defeito central dos dois mecanismos de campos que existiam:
 * na ficha fixa (`lib/contacts/ficha-do-contato.ts`) os grupos moram no código,
 * e nos campos de funil a `key` é ao mesmo tempo a identidade e a chave de
 * armazenamento — renomear órfã os valores. Aqui a identidade é um UUID
 * (`FieldDefinition.id`), a chave de armazenamento (`storage_key`) é imutável e
 * o rótulo é livre. Os VALORES continuam onde sempre estiveram
 * (`contacts.custom_fields` ou coluna nativa); o catálogo é só metadado.
 *
 * O modelo EFETIVO que a ficha renderiza (`ModeloDaFicha`) vem de uma release
 * publicada (`crm_record_layout_releases`) — ou, sem publicação nenhuma, do
 * modelo padrão derivado de `FICHA_DO_CONTATO` (`padrao-do-contato.ts`), para a
 * instalação fresca ficar idêntica à de antes.
 */

import type { CampoNativo, TipoDeCampoDaFicha } from "@/lib/contacts/ficha-do-contato";

export type FieldEntityKind = "contact" | "lead";

/** O vocabulário do banco (CHECK em `crm_field_definitions.field_type`). */
export type FieldType =
  | "text"
  | "textarea"
  | "number"
  | "currency"
  | "date"
  | "select"
  | "multiselect"
  | "boolean"
  | "email"
  | "phone"
  | "url"
  /** Só o seed de `ficha_senha_segredo` usa; a rota recusa criar um novo. */
  | "protected";

/**
 * Opção de lista com identidade estável: `id` nunca muda (é o que vai para o
 * valor gravado), `label` é livre, arquivar tira da escolha nova sem apagar o
 * histórico. No seed do legado o `id` É o literal que já estava gravado
 * ("RCV", "Sim"…), então nenhum valor migra.
 */
export interface FieldOption {
  id: string;
  label: string;
  archived?: boolean;
}

export interface FieldDefinition {
  id: string;
  entity_kind: FieldEntityKind;
  /** Identidade para API/integrações. Imutável. */
  api_key: string;
  /** Chave em `custom_fields` (ou da coluna nativa). Imutável. */
  storage_key: string;
  native_binding: CampoNativo | null;
  field_type: FieldType;
  label: string;
  hint: string | null;
  options: FieldOption[];
  lifecycle: "active" | "archived";
}

// ---------------------------------------------------------------------------
// O documento de layout (jsonb em draft_document / releases.document)
// ---------------------------------------------------------------------------

export interface LayoutCampo {
  field_id: string;
  largura?: 1 | 2;
  destaque?: boolean;
}

export interface LayoutGrupo {
  id: string;
  titulo: string;
  recolhido?: boolean;
  contarPreenchidos?: boolean;
  /** Generalização mínima do `soParaTipos` da ficha fixa: UMA condição. */
  visivelQuando?: { field_id: string; valores: string[] };
  campos: LayoutCampo[];
}

export interface LayoutAba {
  id: string;
  titulo: string;
  grupos: LayoutGrupo[];
}

export interface LayoutDocumentV1 {
  version: 1;
  abas: LayoutAba[];
}

// ---------------------------------------------------------------------------
// O modelo EFETIVO que a ficha renderiza (documento + catálogo compostos)
// ---------------------------------------------------------------------------

export interface CampoResolvido {
  /** Ausente no modelo padrão do código (os campos de lá não têm definição). */
  fieldId?: string;
  /** A `storage_key` — compatível com `CampoDaFicha.chave` do renderer atual. */
  chave: string;
  rotulo: string;
  tipo: TipoDeCampoDaFicha;
  opcoes?: FieldOption[];
  nativo?: CampoNativo;
  dica?: string;
  destaque?: boolean;
  largura?: 1 | 2;
  /** Definição arquivada: valor preenchido aparece somente leitura; vazio some. */
  arquivado?: boolean;
}

export interface GrupoResolvido {
  id: string;
  titulo: string;
  recolhido?: boolean;
  contarPreenchidos?: boolean;
  /** Já resolvido para a CHAVE de armazenamento (o cliente avalia por valores). */
  visivelQuando?: { chave: string; valores: string[] };
  campos: CampoResolvido[];
}

export interface AbaResolvida {
  id: string;
  titulo: string;
  grupos: GrupoResolvido[];
}

export interface ModeloDaFicha {
  abas: AbaResolvida[];
  /** null = modelo padrão do código (nenhuma release publicada). */
  releaseId: string | null;
}

// ---------------------------------------------------------------------------
// Mapeamento entre o vocabulário do banco e o da ficha
// ---------------------------------------------------------------------------

/**
 * O renderer da ficha entende seis tipos. `textarea`/`email`/`phone`/`url`
 * degradam para texto (entrada livre, nada se perde); `boolean` e `multiselect`
 * não têm renderização na ficha neste incremento e devolvem null — o resolvedor
 * pula o campo em vez de desenhar um controle errado.
 */
export function tipoDaFicha(t: FieldType): TipoDeCampoDaFicha | null {
  switch (t) {
    case "text":
    case "textarea":
    case "email":
    case "phone":
    case "url":
      return "texto";
    case "number":
      return "numero";
    case "currency":
      return "moeda";
    case "date":
      return "data";
    case "select":
      return "lista";
    case "protected":
      return "protegido";
    case "boolean":
    case "multiselect":
      return null;
  }
}

/** O inverso, para o seed: todo tipo da ficha fixa tem um `field_type`. */
export function fieldTypeDoTipoDaFicha(t: TipoDeCampoDaFicha): FieldType {
  switch (t) {
    case "texto":
      return "text";
    case "numero":
      return "number";
    case "moeda":
      return "currency";
    case "data":
      return "date";
    case "lista":
      return "select";
    case "protegido":
      return "protected";
  }
}

/** Tipos que o editor OFERECE para campo novo neste incremento. */
export const TIPOS_OFERTADOS: readonly FieldType[] = ["text", "number", "currency", "date", "select"];

/**
 * Prefixo reservado dos links de contato (`lib/leads/links-de-contato.ts`):
 * uma `storage_key` nova nunca pode começar com ele, senão o catálogo disputa
 * a chave com o mecanismo de links.
 */
export const PREFIXO_RESERVADO_DE_LINKS = "link_";

/** Teto de definições ativas por entidade (espelha o teto dos campos de funil). */
export const MAX_CAMPOS_POR_ENTIDADE = 50;

/**
 * O modelo padrão da ficha do contato — a ponte entre a ficha fixa do código e
 * o catálogo dinâmico.
 *
 * Duas saídas, com o MESMO conteúdo:
 *
 * - `modeloPadraoDoContato()` é o FALLBACK: a organização que nunca publicou um
 *   layout renderiza exatamente este modelo, derivado de `FICHA_DO_CONTATO`. É
 *   o que faz a instalação fresca (e a falha de rede no resolve) ficar idêntica
 *   à ficha de antes do catálogo existir.
 * - `seedDoCatalogo()` é o BOOTSTRAP: o material que a rota de bootstrap grava
 *   no banco quando o admin começa a personalizar — as definições (uma por
 *   campo da ficha fixa) e o documento inicial equivalente.
 *
 * A equivalência estrutural entre `modeloPadraoDoContato()` e `FICHA_DO_CONTATO`
 * é critério de aceite, vigiado por `padrao-do-contato.test.ts`. Isomórfico de
 * propósito: o cliente usa o fallback sem importar nada de servidor.
 */

import {
  CHAVE_DO_TIPO_DE_CASO,
  FICHA_DO_CONTATO,
  type CampoDaFicha,
  type GrupoDaFicha,
} from "@/lib/contacts/ficha-do-contato";

import {
  fieldTypeDoTipoDaFicha,
  type FieldOption,
  type LayoutDocumentV1,
  type ModeloDaFicha,
} from "./tipos";

/** Opções da ficha fixa são strings: o id estável É o literal já gravado. */
function opcoesDe(campo: CampoDaFicha): FieldOption[] | undefined {
  return campo.opcoes?.map((o) => ({ id: o, label: o }));
}

function condicaoDe(grupo: GrupoDaFicha): { chave: string; valores: string[] } | undefined {
  return grupo.soParaTipos ? { chave: CHAVE_DO_TIPO_DE_CASO, valores: [...grupo.soParaTipos] } : undefined;
}

export const ABA_PADRAO = { id: "geral", titulo: "Geral" } as const;

/** O modelo efetivo quando NÃO há release publicada. */
export function modeloPadraoDoContato(): ModeloDaFicha {
  return {
    releaseId: null,
    abas: [
      {
        id: ABA_PADRAO.id,
        titulo: ABA_PADRAO.titulo,
        grupos: FICHA_DO_CONTATO.map((g) => ({
          id: g.id,
          titulo: g.titulo,
          ...(g.recolhido ? { recolhido: true } : {}),
          ...(g.contarPreenchidos ? { contarPreenchidos: true } : {}),
          ...(condicaoDe(g) ? { visivelQuando: condicaoDe(g) } : {}),
          campos: g.campos.map((c) => ({
            chave: c.chave,
            rotulo: c.rotulo,
            tipo: c.tipo,
            ...(opcoesDe(c) ? { opcoes: opcoesDe(c) } : {}),
            ...(c.nativo ? { nativo: c.nativo } : {}),
            ...(c.dica ? { dica: c.dica } : {}),
          })),
        })),
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Seed do catálogo
// ---------------------------------------------------------------------------

export interface DefinicaoDoSeed {
  entity_kind: "contact";
  api_key: string;
  storage_key: string;
  native_binding: "cpf" | "birthdate" | "email" | null;
  field_type: ReturnType<typeof fieldTypeDoTipoDaFicha>;
  label: string;
  hint: string | null;
  options: FieldOption[];
  seeded_from: "ficha_do_contato";
}

/** "ficha_banco" → "banco"; coluna nativa fica como está ("cpf"). */
function apiKeyDe(chave: string): string {
  return chave.startsWith("ficha_") ? chave.slice("ficha_".length) : chave;
}

/** Uma definição por campo da ficha fixa, na ordem em que a ficha os declara. */
export function definicoesDoSeed(): DefinicaoDoSeed[] {
  return FICHA_DO_CONTATO.flatMap((g) =>
    g.campos.map((c) => ({
      entity_kind: "contact" as const,
      api_key: apiKeyDe(c.chave),
      storage_key: c.chave,
      native_binding: c.nativo ?? null,
      field_type: fieldTypeDoTipoDaFicha(c.tipo),
      label: c.rotulo,
      hint: c.dica ?? null,
      options: opcoesDe(c) ?? [],
      seeded_from: "ficha_do_contato" as const,
    })),
  );
}

/**
 * O documento inicial do layout, montado DEPOIS do insert das definições —
 * os UUIDs nascem no banco, então quem chama entrega o mapa storage_key → id.
 * Lança se faltar alguma chave: um seed parcial não pode virar documento.
 */
export function documentoDoSeed(idPorStorageKey: ReadonlyMap<string, string>): LayoutDocumentV1 {
  const idDe = (chave: string): string => {
    const id = idPorStorageKey.get(chave);
    if (!id) throw new Error(`seed sem definição para a chave ${chave}`);
    return id;
  };
  return {
    version: 1,
    abas: [
      {
        id: ABA_PADRAO.id,
        titulo: ABA_PADRAO.titulo,
        grupos: FICHA_DO_CONTATO.map((g) => ({
          id: g.id,
          titulo: g.titulo,
          ...(g.recolhido ? { recolhido: true } : {}),
          ...(g.contarPreenchidos ? { contarPreenchidos: true } : {}),
          ...(g.soParaTipos
            ? {
                visivelQuando: {
                  field_id: idDe(CHAVE_DO_TIPO_DE_CASO),
                  valores: [...g.soParaTipos],
                },
              }
            : {}),
          campos: g.campos.map((c) => ({ field_id: idDe(c.chave) })),
        })),
      },
    ],
  };
}

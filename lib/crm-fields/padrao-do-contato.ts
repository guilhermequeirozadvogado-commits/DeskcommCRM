/**
 * O ponto de partida da ficha do contato, quando a organização ainda não
 * montou a sua.
 *
 * Duas saídas, e nenhuma traz campo:
 *
 * - `modeloVazioDoContato()` é o que a ficha renderiza enquanto NÃO há release
 *   publicada: zero grupos. A tela mostra um estado vazio com o caminho para
 *   Configurações → Fichas e campos — nunca uma ficha inventada pelo código.
 * - `documentoInicial()` é o rascunho que "Começar a personalizar" grava: uma
 *   aba, nenhum grupo. Quem administra cria os campos e os grupos pela tela.
 *
 * Até 2026-10 as duas saídas derivavam de uma ficha de pré-atendimento jurídico
 * fixa no código (`FICHA_DO_CONTATO`), que valia para toda instalação. Ela saiu
 * daqui: ficha de nicho é configuração da organização, guardada no banco, e não
 * conteúdo do núcleo. As organizações que já tinham começado a personalizar não
 * mudam — a ficha delas é a release publicada, e o bootstrap não toca em layout
 * que já existe.
 */

import type { LayoutDocumentV1, ModeloDaFicha } from "./tipos";

export const ABA_PADRAO = { id: "geral", titulo: "Geral" } as const;

/** O modelo efetivo quando NÃO há release publicada: nenhum grupo. */
export function modeloVazioDoContato(): ModeloDaFicha {
  return { releaseId: null, abas: [] };
}

/** O rascunho em branco do "Começar a personalizar". */
export function documentoInicial(): LayoutDocumentV1 {
  return { version: 1, abas: [{ id: ABA_PADRAO.id, titulo: ABA_PADRAO.titulo, grupos: [] }] };
}

/** A ficha tem algo para mostrar? Release com abas só de grupos vazios conta como vazia. */
export function modeloTemCampos(modelo: ModeloDaFicha): boolean {
  return modelo.abas.some((a) => a.grupos.some((g) => g.campos.length > 0));
}

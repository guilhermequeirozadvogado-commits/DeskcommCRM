/**
 * Visibilidade de grupos do modelo resolvido — a MESMA semântica de
 * `gruposVisiveis` da ficha fixa, portada para `ModeloDaFicha`: grupo com
 * condição entra quando a condição bate, mas entra TAMBÉM quando já tem algum
 * valor preenchido, para que trocar o tipo de caso nunca esconda um dado já
 * digitado. Campos nativos ficam fora da checagem de "já preenchido" (como na
 * origem: a condição é sobre os dados da ficha, não sobre CPF/e-mail).
 */

import { estaPreenchido } from "@/lib/contacts/ficha-do-contato";

import type { AbaResolvida, GrupoResolvido } from "./tipos";

export function grupoVisivel(grupo: GrupoResolvido, valores: Record<string, unknown>): boolean {
  if (!grupo.visivelQuando) return true;
  const atual = valores[grupo.visivelQuando.chave];
  if (typeof atual === "string" && grupo.visivelQuando.valores.includes(atual)) return true;
  return grupo.campos.some((c) => !c.nativo && estaPreenchido(valores[c.chave]));
}

export function gruposVisiveisDoModelo(aba: AbaResolvida, valores: Record<string, unknown>): GrupoResolvido[] {
  return aba.grupos.filter((g) => grupoVisivel(g, valores));
}

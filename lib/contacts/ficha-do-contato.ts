/**
 * A FICHA DO CONTATO — o vocabulário dos campos e as conversões de valor.
 *
 * O DESENHO da ficha (abas, grupos, campos) não mora mais no código: cada
 * organização monta a sua em Configurações → Fichas e campos (`lib/crm-fields/`),
 * e a ficha renderiza a release publicada. Antes, a ficha do pré-atendimento
 * jurídico de um escritório estava fixa aqui e valia para toda instalação —
 * conteúdo de nicho no núcleo. Este arquivo guarda só o que é de qualquer ficha.
 *
 * Onde os valores moram: `contacts.custom_fields` (jsonb, teto de 32 KB no
 * schema da rota), sob chaves com o prefixo `ficha_` — o prefixo separa estes
 * campos dos campos do funil, que gravam no mesmo objeto. Três campos podem
 * apontar para coluna própria do contato em vez de `custom_fields`: CPF
 * (cifrado em repouso), data de nascimento e e-mail (`nativo`).
 *
 * LGPD: a anonimização zera `custom_fields` inteiro (gatilho da migration 0656).
 * Nada daqui sai pelos webhooks (projeção pública em
 * `lib/automation/actions/call-webhook.ts`) nem pela ferramenta de leitura de
 * contato da IA (`lib/mcp/tools/contacts.ts`, lista fechada de campos).
 */

export type TipoDeCampoDaFicha =
  | "texto"
  | "numero"
  | "moeda"
  | "data"
  | "lista"
  /** Texto que aparece mascarado até alguém pedir para ver. */
  | "protegido";

/** Coluna própria do contato, fora de `custom_fields`. */
export type CampoNativo = "cpf" | "birthdate" | "email";

export function estaPreenchido(v: unknown): boolean {
  if (v === null || v === undefined) return false;
  if (typeof v === "string") return v.trim() !== "";
  return true;
}

// ---------------------------------------------------------------------------
// Dinheiro: guardado em CENTAVOS (inteiro), digitado e mostrado em reais.
// ---------------------------------------------------------------------------

const REAIS = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** 125050 → "1.250,50". */
export function centavosParaTexto(centavos: unknown): string {
  return typeof centavos === "number" && Number.isFinite(centavos) ? REAIS.format(centavos / 100) : "";
}

/**
 * "1.250,50", "1250,5", "R$ 1.250" ou "1250.50" → centavos. Vazio → null.
 * Devolve `undefined` quando o texto não é um valor (para a tela recusar).
 */
export function textoParaCentavos(texto: string): number | null | undefined {
  const limpo = texto.replace(/R\$|\s/g, "");
  if (limpo === "") return null;
  let normalizado: string;
  if (limpo.includes(",")) {
    // pt-BR: ponto é milhar, vírgula é decimal.
    normalizado = limpo.replace(/\./g, "").replace(",", ".");
  } else if (/^\d{1,3}(\.\d{3})+$/.test(limpo)) {
    // "1.250" sem vírgula é milhar, não 1,25.
    normalizado = limpo.replace(/\./g, "");
  } else {
    normalizado = limpo;
  }
  if (!/^\d+(\.\d{1,2})?$/.test(normalizado)) return undefined;
  return Math.round(Number(normalizado) * 100);
}

/** "48" → 48. Vazio → null. Não-inteiro → undefined. */
export function textoParaInteiro(texto: string): number | null | undefined {
  const limpo = texto.trim();
  if (limpo === "") return null;
  return /^\d{1,6}$/.test(limpo) ? Number(limpo) : undefined;
}

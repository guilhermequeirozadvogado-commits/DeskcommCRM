/**
 * A FICHA DO CONTATO — os campos do pré-atendimento, organizados em grupos.
 *
 * Fonte única do que a ficha mostra: o painel da conversa e a página do contato
 * desenham a partir desta lista, e é ela que diz quais campos são protegidos.
 *
 * Onde os valores moram: `contacts.custom_fields` (jsonb, teto de 32 KB no
 * schema da rota), sob chaves com o prefixo `ficha_` — o prefixo separa estes
 * campos dos campos do funil, que gravam no mesmo objeto. Três campos da
 * qualificação NÃO moram ali, porque o contato já tem coluna própria para eles:
 * CPF (cifrado em repouso), data de nascimento e e-mail (`nativo`).
 *
 * LGPD: a anonimização zera `custom_fields` inteiro (gatilho da migration 0656).
 * Nada daqui sai pelos webhooks (projeção pública em
 * `lib/automation/actions/call-webhook.ts`) nem pela ferramenta de leitura de
 * contato da IA (`lib/mcp/tools/contacts.ts`, lista fechada de campos).
 *
 * Os nomes seguem o cadastro do QMZ CRM (`CADASTRO-CLIENTES.md` de lá), para a
 * integração levar cada dado ao destino certo: cliente, caso ou processo.
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

export interface CampoDaFicha {
  /** Chave em `custom_fields` (com o prefixo `ficha_`), ou da coluna nativa. */
  chave: string;
  rotulo: string;
  tipo: TipoDeCampoDaFicha;
  opcoes?: readonly string[];
  nativo?: CampoNativo;
  dica?: string;
}

export interface GrupoDaFicha {
  id: string;
  titulo: string;
  /** Só aparece quando `ficha_tipo_caso` é um destes valores. */
  soParaTipos?: readonly string[];
  /** Começa recolhido (a qualificação só importa quando vira cliente). */
  recolhido?: boolean;
  /** Mostra "N de M preenchidos" no título. */
  contarPreenchidos?: boolean;
  campos: readonly CampoDaFicha[];
}

export const CHAVE_DO_TIPO_DE_CASO = "ficha_tipo_caso";

export const TIPOS_DE_CASO = ["RCV", "DBA", "RMC/RCC", "Fraude", "Outro"] as const;

const SIM_NAO = ["Sim", "Não"] as const;

export const FICHA_DO_CONTATO: readonly GrupoDaFicha[] = [
  {
    id: "atendimento",
    titulo: "Atendimento",
    campos: [
      {
        chave: CHAVE_DO_TIPO_DE_CASO,
        rotulo: "Tipo de caso",
        tipo: "lista",
        opcoes: TIPOS_DE_CASO,
        dica: "RCV: o carro está com o cliente. DBA: o carro foi apreendido.",
      },
      {
        chave: "ficha_origem_lead",
        rotulo: "Origem do lead",
        tipo: "lista",
        opcoes: ["Instagram", "Meta Ads", "Google Ads", "TikTok", "YouTube", "Indicação", "Site", "Outro"],
      },
    ],
  },
  {
    id: "contrato",
    titulo: "Contrato",
    campos: [
      { chave: "ficha_banco", rotulo: "Banco", tipo: "texto" },
      { chave: "ficha_titular_nome", rotulo: "Titular do contrato", tipo: "texto" },
      { chave: "ficha_titular_cpf", rotulo: "CPF do titular", tipo: "texto" },
      { chave: "ficha_capitalizacao_diaria", rotulo: "Capitalização diária", tipo: "lista", opcoes: SIM_NAO },
      { chave: "ficha_seguro_prestamista", rotulo: "Seguro prestamista", tipo: "lista", opcoes: SIM_NAO },
    ],
  },
  {
    id: "parcelas",
    titulo: "Parcelas",
    soParaTipos: ["RCV"],
    campos: [
      { chave: "ficha_total_parcelas", rotulo: "Total de parcelas", tipo: "numero" },
      { chave: "ficha_parcelas_pagas", rotulo: "Parcelas pagas", tipo: "numero" },
      { chave: "ficha_parcelas_atrasadas", rotulo: "Parcelas atrasadas", tipo: "numero" },
      { chave: "ficha_valor_parcela", rotulo: "Valor da parcela", tipo: "moeda" },
      { chave: "ficha_valor_em_aberto", rotulo: "Valor em aberto", tipo: "moeda" },
      { chave: "ficha_valor_para_quitar", rotulo: "Valor p/ quitar", tipo: "moeda" },
      { chave: "ficha_economia", rotulo: "Economia de", tipo: "texto" },
    ],
  },
  {
    id: "processo",
    titulo: "Processo",
    campos: [
      { chave: "ficha_busca_apreensao", rotulo: "Busca e apreensão", tipo: "texto" },
      { chave: "ficha_processo_numero", rotulo: "Processo nº", tipo: "texto" },
      { chave: "ficha_processo_cidade_uf", rotulo: "Cidade/UF", tipo: "texto" },
      { chave: "ficha_valor_causa", rotulo: "Valor da causa", tipo: "moeda" },
      {
        chave: "ficha_senha_segredo",
        rotulo: "Senha (segredo de justiça)",
        tipo: "protegido",
        dica: "Fica oculta na tela e não é enviada para a IA nem para outros sistemas.",
      },
    ],
  },
  {
    id: "apreensao",
    titulo: "Apreensão",
    soParaTipos: ["DBA"],
    campos: [
      { chave: "ficha_data_apreensao", rotulo: "Data da apreensão", tipo: "data" },
      { chave: "ficha_data_juntada_mandado", rotulo: "Data da juntada do mandado", tipo: "data" },
    ],
  },
  {
    id: "qualificacao",
    titulo: "Qualificação (procuração)",
    recolhido: true,
    contarPreenchidos: true,
    campos: [
      { chave: "ficha_nome_completo", rotulo: "Nome completo", tipo: "texto" },
      { chave: "ficha_genero", rotulo: "Gênero", tipo: "lista", opcoes: ["Masculino", "Feminino"] },
      { chave: "ficha_nacionalidade", rotulo: "Nacionalidade", tipo: "texto" },
      {
        chave: "ficha_estado_civil",
        rotulo: "Estado civil",
        tipo: "lista",
        opcoes: ["Solteiro(a)", "Casado(a)", "Divorciado(a)", "Separado(a) judicialmente", "Viúvo(a)"],
      },
      { chave: "ficha_uniao_estavel", rotulo: "União estável", tipo: "lista", opcoes: SIM_NAO },
      { chave: "ficha_profissao", rotulo: "Profissão", tipo: "texto" },
      { chave: "cpf", rotulo: "CPF", tipo: "texto", nativo: "cpf" },
      { chave: "ficha_rg", rotulo: "RG", tipo: "texto" },
      { chave: "ficha_rg_orgao_uf", rotulo: "Órgão/UF do RG", tipo: "texto" },
      { chave: "birthdate", rotulo: "Data de nascimento", tipo: "data", nativo: "birthdate" },
      { chave: "email", rotulo: "E-mail", tipo: "texto", nativo: "email" },
      { chave: "ficha_cep", rotulo: "CEP", tipo: "texto" },
      { chave: "ficha_logradouro", rotulo: "Logradouro", tipo: "texto" },
      { chave: "ficha_numero", rotulo: "Número", tipo: "texto" },
      { chave: "ficha_complemento", rotulo: "Complemento", tipo: "texto" },
      { chave: "ficha_bairro", rotulo: "Bairro", tipo: "texto" },
      { chave: "ficha_cidade", rotulo: "Cidade", tipo: "texto" },
      { chave: "ficha_uf", rotulo: "UF", tipo: "texto" },
      { chave: "ficha_nome_mae", rotulo: "Nome da mãe", tipo: "texto" },
    ],
  },
];

/** O tipo de caso que a ficha registra, quando é um dos conhecidos. */
export function tipoDeCasoDa(valores: Record<string, unknown>): string | null {
  const v = valores[CHAVE_DO_TIPO_DE_CASO];
  return typeof v === "string" && v.trim() !== "" ? v : null;
}

/**
 * Os grupos que aparecem para este contato. Grupo condicionado a um tipo de
 * caso só entra quando o tipo bate — mas entra também quando já tem algum valor
 * preenchido, para que trocar o tipo nunca esconda um dado já digitado.
 */
export function gruposVisiveis(
  valores: Record<string, unknown>,
  grupos: readonly GrupoDaFicha[] = FICHA_DO_CONTATO,
): GrupoDaFicha[] {
  const tipo = tipoDeCasoDa(valores);
  return grupos.filter((g) => {
    if (!g.soParaTipos) return true;
    if (tipo !== null && g.soParaTipos.includes(tipo)) return true;
    return g.campos.some((c) => !c.nativo && estaPreenchido(valores[c.chave]));
  });
}

export function estaPreenchido(v: unknown): boolean {
  if (v === null || v === undefined) return false;
  if (typeof v === "string") return v.trim() !== "";
  return true;
}

/** Chaves cujo valor nunca deve sair da ficha (tela mascarada, fora de exportações). */
export function chavesProtegidas(grupos: readonly GrupoDaFicha[] = FICHA_DO_CONTATO): Set<string> {
  return new Set(grupos.flatMap((g) => g.campos.filter((c) => c.tipo === "protegido").map((c) => c.chave)));
}

/** `custom_fields` sem os campos protegidos — para qualquer saída que não seja a própria ficha. */
export function semCamposProtegidos(
  valores: Record<string, unknown> | null | undefined,
  grupos: readonly GrupoDaFicha[] = FICHA_DO_CONTATO,
): Record<string, unknown> {
  const protegidas = chavesProtegidas(grupos);
  return Object.fromEntries(Object.entries(valores ?? {}).filter(([k]) => !protegidas.has(k)));
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

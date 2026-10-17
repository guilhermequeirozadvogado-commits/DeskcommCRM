import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

import { FalhaAoResolverFicha, chavesProtegidasDoModelo, comporModelo, resolverModeloDoContato } from "./resolvedor";
import type { LayoutDocumentV1 } from "./tipos";

const RELEASE = "99999999-9999-4999-8999-999999999999";
const F_TIPO = "11111111-1111-4111-8111-111111111111";
const F_BANCO = "22222222-2222-4222-8222-222222222222";
const F_SENHA = "33333333-3333-4333-8333-333333333333";
const F_SUMIDO = "44444444-4444-4444-8444-444444444444";

function def(id: string, parcial: Partial<Record<string, unknown>> = {}) {
  return {
    id,
    entity_kind: "contact",
    api_key: `k_${id.slice(0, 4)}`,
    storage_key: `ficha_k_${id.slice(0, 4)}`,
    native_binding: null,
    field_type: "text",
    label: `Campo ${id.slice(0, 4)}`,
    hint: null,
    options: [],
    lifecycle: "active",
    ...parcial,
  };
}

const DOC: LayoutDocumentV1 = {
  version: 1,
  abas: [
    {
      id: "geral",
      titulo: "Geral",
      grupos: [
        {
          id: "contrato",
          titulo: "Contrato",
          visivelQuando: { field_id: F_TIPO, valores: ["RCV"] },
          campos: [
            { field_id: F_BANCO, destaque: true },
            { field_id: F_SENHA },
            { field_id: F_SUMIDO },
          ],
        },
      ],
    },
  ],
};

describe("comporModelo", () => {
  const definicoes = [
    def(F_TIPO, { storage_key: "ficha_tipo_caso", field_type: "select", options: [{ id: "RCV", label: "RCV" }] }),
    def(F_BANCO, { storage_key: "ficha_banco", label: "Banco" }),
    def(F_SENHA, { storage_key: "ficha_senha", field_type: "protected", lifecycle: "archived" }),
  ];
  const modelo = comporModelo(DOC, definicoes, RELEASE);
  const grupo = modelo.abas[0]!.grupos[0]!;

  it("campo resolve para a storage_key, com rótulo, tipo mapeado e flags do layout", () => {
    expect(modelo.releaseId).toBe(RELEASE);
    const banco = grupo.campos.find((c) => c.fieldId === F_BANCO)!;
    expect(banco.chave).toBe("ficha_banco");
    expect(banco.rotulo).toBe("Banco");
    expect(banco.tipo).toBe("texto");
    expect(banco.destaque).toBe(true);
  });

  it("field_id sem definição é pulado — a ficha não quebra", () => {
    expect(grupo.campos.some((c) => c.fieldId === F_SUMIDO)).toBe(false);
    expect(grupo.campos).toHaveLength(2);
  });

  it("definição arquivada entra marcada `arquivado` (valor preenchido vira leitura)", () => {
    const senha = grupo.campos.find((c) => c.fieldId === F_SENHA)!;
    expect(senha.arquivado).toBe(true);
    expect(senha.tipo).toBe("protegido");
  });

  it("visivelQuando resolve para a CHAVE da definição-condição", () => {
    expect(grupo.visivelQuando).toEqual({ chave: "ficha_tipo_caso", valores: ["RCV"] });
  });

  it("condição apontando para definição sumida cai — grupo fica visível", () => {
    const semCondicao = comporModelo(DOC, definicoes.filter((d) => d.id !== F_TIPO), RELEASE);
    expect(semCondicao.abas[0]!.grupos[0]!.visivelQuando).toBeUndefined();
  });

  it("tipo sem renderização na ficha (boolean/multiselect) é pulado", () => {
    const comBoolean = comporModelo(DOC, [
      ...definicoes.filter((d) => d.id !== F_BANCO),
      def(F_BANCO, { field_type: "boolean" }),
    ], RELEASE);
    expect(comBoolean.abas[0]!.grupos[0]!.campos.some((c) => c.fieldId === F_BANCO)).toBe(false);
  });

  it("chavesProtegidasDoModelo enxerga o protegido do modelo dinâmico", () => {
    expect(chavesProtegidasDoModelo(modelo).has("ficha_senha")).toBe(true);
    expect(chavesProtegidasDoModelo(modelo).has("ficha_banco")).toBe(false);
  });
});

/**
 * O cliente falso responde por TABELA: cada `from(t)` devolve uma cadeia em
 * que `eq` encadeia, `maybeSingle()` resolve a linha, e a cadeia é ela mesma
 * "awaitable" (a leitura de definições não chama `maybeSingle`).
 */
type Resposta = { data: unknown; error: { message: string } | null };
function clienteFalso(porTabela: Record<string, Resposta>): SupabaseClient {
  return {
    from(tabela: string) {
      const resposta = porTabela[tabela] ?? { data: null, error: null };
      const cadeia = {
        select: () => cadeia,
        eq: () => cadeia,
        maybeSingle: () => Promise.resolve(resposta),
        then: (ok: (r: Resposta) => unknown, falha?: (e: unknown) => unknown) => Promise.resolve(resposta).then(ok, falha),
      };
      return cadeia;
    },
  } as unknown as SupabaseClient;
}

describe("resolverModeloDoContato — sem publicação, vazio; com falha, erro", () => {
  const ORG = "55555555-5555-4555-8555-555555555555";

  it("organização que nunca começou a personalizar: modelo vazio", async () => {
    const modelo = await resolverModeloDoContato(clienteFalso({}), ORG);
    expect(modelo).toEqual({ releaseId: null, abas: [] });
  });

  it("rascunho sem publicação: modelo vazio", async () => {
    const admin = clienteFalso({ crm_record_layouts: { data: { id: "l", active_release_id: null }, error: null } });
    expect((await resolverModeloDoContato(admin, ORG)).abas).toEqual([]);
  });

  it("falha ao ler o ponteiro LANÇA — nunca troca a ficha por outra", async () => {
    const admin = clienteFalso({ crm_record_layouts: { data: null, error: { message: "timeout" } } });
    await expect(resolverModeloDoContato(admin, ORG)).rejects.toBeInstanceOf(FalhaAoResolverFicha);
  });

  it("falha ao ler a release ou o catálogo LANÇA", async () => {
    const ponteiro = { data: { id: "l", active_release_id: RELEASE }, error: null };
    const semRelease = clienteFalso({
      crm_record_layouts: ponteiro,
      crm_record_layout_releases: { data: null, error: { message: "boom" } },
    });
    await expect(resolverModeloDoContato(semRelease, ORG)).rejects.toBeInstanceOf(FalhaAoResolverFicha);
    const semCatalogo = clienteFalso({
      crm_record_layouts: ponteiro,
      crm_record_layout_releases: { data: { id: RELEASE, document: DOC }, error: null },
      crm_field_definitions: { data: null, error: { message: "boom" } },
    });
    await expect(resolverModeloDoContato(semCatalogo, ORG)).rejects.toBeInstanceOf(FalhaAoResolverFicha);
  });

  it("release publicada: compõe o documento com o catálogo", async () => {
    const admin = clienteFalso({
      crm_record_layouts: { data: { id: "l", active_release_id: RELEASE }, error: null },
      crm_record_layout_releases: { data: { id: RELEASE, document: DOC }, error: null },
      crm_field_definitions: { data: [def(F_TIPO), def(F_BANCO)], error: null },
    });
    const modelo = await resolverModeloDoContato(admin, ORG);
    expect(modelo.releaseId).toBe(RELEASE);
    expect(modelo.abas.length).toBeGreaterThan(0);
  });
});

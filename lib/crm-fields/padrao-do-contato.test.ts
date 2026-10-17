/**
 * CRITÉRIO DE ACEITE do catálogo: o modelo padrão (fallback sem publicação) e o
 * seed do bootstrap são EQUIVALENTES à `FICHA_DO_CONTATO` do código — grupo a
 * grupo, campo a campo, opção a opção. Comparação estrutural, não snapshot:
 * quando a ficha fixa mudar, a mensagem diz O QUE divergiu.
 */
import { describe, expect, it } from "vitest";

import { CHAVE_DO_TIPO_DE_CASO, FICHA_DO_CONTATO } from "@/lib/contacts/ficha-do-contato";

import { layoutDocumentSchema, validarParaPublicar } from "./layout-schema";
import { definicoesDoSeed, documentoDoSeed, modeloPadraoDoContato } from "./padrao-do-contato";
import { gruposVisiveisDoModelo } from "./visibilidade";

describe("modelo padrão ≍ FICHA_DO_CONTATO", () => {
  const modelo = modeloPadraoDoContato();

  it("uma aba só — o renderer não mostra barra de abas, como hoje", () => {
    expect(modelo.releaseId).toBeNull();
    expect(modelo.abas).toHaveLength(1);
  });

  it("grupos: mesma ordem, ids, títulos e flags", () => {
    const grupos = modelo.abas[0]!.grupos;
    expect(grupos.map((g) => g.id)).toEqual(FICHA_DO_CONTATO.map((g) => g.id));
    for (const [i, g] of FICHA_DO_CONTATO.entries()) {
      expect(grupos[i]!.titulo).toBe(g.titulo);
      expect(grupos[i]!.recolhido ?? false).toBe(g.recolhido ?? false);
      expect(grupos[i]!.contarPreenchidos ?? false).toBe(g.contarPreenchidos ?? false);
    }
  });

  it("campos: mesma ordem, chaves, rótulos, tipos, nativos, dicas e opções", () => {
    for (const [i, g] of FICHA_DO_CONTATO.entries()) {
      const resolvidos = modelo.abas[0]!.grupos[i]!.campos;
      expect(resolvidos.map((c) => c.chave)).toEqual(g.campos.map((c) => c.chave));
      for (const [j, c] of g.campos.entries()) {
        const r = resolvidos[j]!;
        expect(r.rotulo).toBe(c.rotulo);
        expect(r.tipo).toBe(c.tipo);
        expect(r.nativo).toBe(c.nativo);
        expect(r.dica).toBe(c.dica);
        expect(r.opcoes?.map((o) => o.id)).toEqual(c.opcoes ? [...c.opcoes] : undefined);
        expect(r.opcoes?.map((o) => o.label)).toEqual(c.opcoes ? [...c.opcoes] : undefined);
      }
    }
  });

  it("soParaTipos virou visivelQuando apontando para o tipo de caso", () => {
    for (const [i, g] of FICHA_DO_CONTATO.entries()) {
      const r = modelo.abas[0]!.grupos[i]!;
      if (g.soParaTipos) {
        expect(r.visivelQuando).toEqual({ chave: CHAVE_DO_TIPO_DE_CASO, valores: [...g.soParaTipos] });
      } else {
        expect(r.visivelQuando).toBeUndefined();
      }
    }
  });

  it("a visibilidade portada decide igual à da ficha fixa", () => {
    const ids = (valores: Record<string, unknown>) =>
      gruposVisiveisDoModelo(modelo.abas[0]!, valores).map((g) => g.id);
    expect(ids({})).toEqual(["atendimento", "contrato", "processo", "qualificacao"]);
    expect(ids({ ficha_tipo_caso: "RCV" })).toContain("parcelas");
    expect(ids({ ficha_tipo_caso: "RCV" })).not.toContain("apreensao");
    expect(ids({ ficha_tipo_caso: "DBA" })).toContain("apreensao");
    // Trocar o tipo não esconde dado já digitado no grupo do outro tipo.
    expect(ids({ ficha_tipo_caso: "DBA", ficha_total_parcelas: 48 })).toContain("parcelas");
  });
});

describe("seed do catálogo", () => {
  const definicoes = definicoesDoSeed();

  it("uma definição por campo da ficha, com storage_key = chave e api_key sem o prefixo", () => {
    const campos = FICHA_DO_CONTATO.flatMap((g) => g.campos);
    expect(definicoes.map((d) => d.storage_key)).toEqual(campos.map((c) => c.chave));
    for (const d of definicoes) {
      expect(d.api_key).toBe(d.storage_key.startsWith("ficha_") ? d.storage_key.slice(6) : d.storage_key);
      expect(d.seeded_from).toBe("ficha_do_contato");
    }
    // api_key e storage_key únicas — é a unique do banco, provada aqui no material.
    expect(new Set(definicoes.map((d) => d.api_key)).size).toBe(definicoes.length);
    expect(new Set(definicoes.map((d) => d.storage_key)).size).toBe(definicoes.length);
  });

  it("colunas nativas carregam o binding; as demais não", () => {
    const porChave = new Map(definicoes.map((d) => [d.storage_key, d]));
    expect(porChave.get("cpf")?.native_binding).toBe("cpf");
    expect(porChave.get("birthdate")?.native_binding).toBe("birthdate");
    expect(porChave.get("email")?.native_binding).toBe("email");
    expect(porChave.get("ficha_banco")?.native_binding).toBeNull();
  });

  it("opções do legado nascem com id = literal já gravado — nenhum valor migra", () => {
    const tipoCaso = definicoes.find((d) => d.storage_key === CHAVE_DO_TIPO_DE_CASO);
    expect(tipoCaso?.options.map((o) => o.id)).toEqual(["RCV", "DBA", "RMC/RCC", "Fraude", "Outro"]);
    expect(tipoCaso?.options.map((o) => o.label)).toEqual(tipoCaso?.options.map((o) => o.id));
  });

  it("o documento do seed é válido, publicável e cobre todos os campos", () => {
    const idPorChave = new Map(definicoes.map((d, i) => [d.storage_key, `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`]));
    const doc = documentoDoSeed(idPorChave);
    expect(layoutDocumentSchema.safeParse(doc).success).toBe(true);
    const catalogo = definicoes.map((d) => ({
      id: idPorChave.get(d.storage_key)!,
      entity_kind: "contact" as const,
      lifecycle: "active" as const,
    }));
    expect(validarParaPublicar(doc, catalogo)).toEqual({ ok: true });
    const referenciados = doc.abas[0]!.grupos.flatMap((g) => g.campos.map((c) => c.field_id));
    expect(referenciados).toHaveLength(definicoes.length);
  });

  it("seed parcial não vira documento: chave sem id lança", () => {
    expect(() => documentoDoSeed(new Map())).toThrow(/sem definição/);
  });
});

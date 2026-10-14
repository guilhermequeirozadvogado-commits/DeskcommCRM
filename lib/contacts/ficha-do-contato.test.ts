import { describe, expect, it } from "vitest";

import {
  FICHA_DO_CONTATO,
  centavosParaTexto,
  chavesProtegidas,
  gruposVisiveis,
  semCamposProtegidos,
  textoParaCentavos,
  textoParaInteiro,
} from "./ficha-do-contato";

const ids = (valores: Record<string, unknown>) => gruposVisiveis(valores).map((g) => g.id);

describe("ficha do contato — grupos que aparecem", () => {
  it("sem tipo de caso, os grupos condicionados ficam de fora", () => {
    expect(ids({})).toEqual(["atendimento", "contrato", "processo", "qualificacao"]);
  });

  it("RCV mostra Parcelas e não Apreensão; DBA o contrário", () => {
    expect(ids({ ficha_tipo_caso: "RCV" })).toContain("parcelas");
    expect(ids({ ficha_tipo_caso: "RCV" })).not.toContain("apreensao");
    expect(ids({ ficha_tipo_caso: "DBA" })).toContain("apreensao");
    expect(ids({ ficha_tipo_caso: "DBA" })).not.toContain("parcelas");
  });

  it("trocar o tipo não esconde dado já digitado no grupo do outro tipo", () => {
    expect(ids({ ficha_tipo_caso: "DBA", ficha_total_parcelas: 48 })).toContain("parcelas");
  });

  it("toda chave guardada em custom_fields tem o prefixo ficha_ e é única", () => {
    const chaves = FICHA_DO_CONTATO.flatMap((g) => g.campos.filter((c) => !c.nativo).map((c) => c.chave));
    expect(chaves.every((c) => c.startsWith("ficha_"))).toBe(true);
    expect(new Set(chaves).size).toBe(chaves.length);
  });
});

describe("ficha do contato — campo protegido", () => {
  it("a senha de segredo de justiça é protegida", () => {
    expect(chavesProtegidas().has("ficha_senha_segredo")).toBe(true);
  });

  it("semCamposProtegidos tira só o protegido", () => {
    expect(semCamposProtegidos({ ficha_banco: "Pan", ficha_senha_segredo: "x1y2" })).toEqual({ ficha_banco: "Pan" });
    expect(semCamposProtegidos(null)).toEqual({});
  });
});

describe("ficha do contato — valores", () => {
  it.each([
    ["1.250,50", 125050],
    ["1250,5", 125050],
    ["R$ 1.250", 125000],
    ["1250.50", 125050],
    ["35000", 3500000],
    ["", null],
  ])("%s → %s centavos", (texto, centavos) => {
    expect(textoParaCentavos(texto)).toBe(centavos);
  });

  it("texto que não é valor é recusado", () => {
    expect(textoParaCentavos("mil reais")).toBeUndefined();
    expect(textoParaCentavos("1,2,3")).toBeUndefined();
  });

  it("centavos voltam no formato brasileiro", () => {
    expect(centavosParaTexto(125050)).toBe("1.250,50");
    expect(centavosParaTexto(undefined)).toBe("");
  });

  it("número de parcelas é inteiro", () => {
    expect(textoParaInteiro("48")).toBe(48);
    expect(textoParaInteiro("")).toBeNull();
    expect(textoParaInteiro("4,5")).toBeUndefined();
  });
});

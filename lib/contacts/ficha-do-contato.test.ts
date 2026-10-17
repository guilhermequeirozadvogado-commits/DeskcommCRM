import { describe, expect, it } from "vitest";

import { centavosParaTexto, estaPreenchido, textoParaCentavos, textoParaInteiro } from "./ficha-do-contato";

describe("ficha do contato — preenchimento", () => {
  it("vazio, espaço e ausência não contam; zero e falso contam", () => {
    expect(estaPreenchido(undefined)).toBe(false);
    expect(estaPreenchido(null)).toBe(false);
    expect(estaPreenchido("  ")).toBe(false);
    expect(estaPreenchido(0)).toBe(true);
    expect(estaPreenchido(false)).toBe(true);
    expect(estaPreenchido("Pan")).toBe(true);
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

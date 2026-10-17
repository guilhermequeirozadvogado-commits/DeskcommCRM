/**
 * O ponto de partida da ficha não traz campo nenhum: sem publicação, a ficha é
 * vazia (a tela mostra o caminho para configurar), e o "Começar a personalizar"
 * grava um rascunho em branco. Nenhum conteúdo de nicho mora no código.
 */
import { describe, expect, it } from "vitest";

import { layoutDocumentSchema } from "./layout-schema";
import { documentoInicial, modeloTemCampos, modeloVazioDoContato } from "./padrao-do-contato";

describe("modelo sem publicação", () => {
  it("não tem release nem grupo", () => {
    const modelo = modeloVazioDoContato();
    expect(modelo.releaseId).toBeNull();
    expect(modelo.abas).toEqual([]);
    expect(modeloTemCampos(modelo)).toBe(false);
  });
});

describe("rascunho inicial do bootstrap", () => {
  it("é um documento válido, com uma aba e nenhum grupo", () => {
    const doc = documentoInicial();
    expect(layoutDocumentSchema.safeParse(doc).success).toBe(true);
    expect(doc.abas).toHaveLength(1);
    expect(doc.abas[0]!.grupos).toEqual([]);
  });

  it("cada chamada devolve um objeto novo (o editor muta o rascunho local)", () => {
    expect(documentoInicial()).not.toBe(documentoInicial());
  });
});

describe("modeloTemCampos", () => {
  it("grupo sem campo não conta; um campo basta", () => {
    const aba = (campos: number) => ({
      id: "geral",
      titulo: "Geral",
      grupos: [
        {
          id: "g",
          titulo: "G",
          campos: Array.from({ length: campos }, (_, i) => ({ chave: `ficha_c${i}`, rotulo: `C${i}`, tipo: "texto" as const })),
        },
      ],
    });
    expect(modeloTemCampos({ releaseId: "r", abas: [aba(0)] })).toBe(false);
    expect(modeloTemCampos({ releaseId: "r", abas: [aba(1)] })).toBe(true);
  });
});

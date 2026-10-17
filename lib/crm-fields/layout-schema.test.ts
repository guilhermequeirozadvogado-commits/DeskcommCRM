import { describe, expect, it } from "vitest";

import { LIMITES_DO_LAYOUT, layoutDocumentSchema, validarParaPublicar } from "./layout-schema";
import type { LayoutDocumentV1 } from "./tipos";

const F1 = "11111111-1111-4111-8111-111111111111";
const F2 = "22222222-2222-4222-8222-222222222222";

function doc(parcial?: Partial<LayoutDocumentV1>): LayoutDocumentV1 {
  return {
    version: 1,
    abas: [
      {
        id: "geral",
        titulo: "Geral",
        grupos: [{ id: "atendimento", titulo: "Atendimento", campos: [{ field_id: F1 }] }],
      },
    ],
    ...parcial,
  };
}

describe("layoutDocumentSchema", () => {
  it("documento mínimo válido passa", () => {
    expect(layoutDocumentSchema.safeParse(doc()).success).toBe(true);
  });

  it("version diferente de 1 é recusada", () => {
    expect(layoutDocumentSchema.safeParse({ ...doc(), version: 2 }).success).toBe(false);
  });

  it("id de nó repetido é recusado (aba e grupo compartilham o espaço)", () => {
    const d = doc({
      abas: [
        {
          id: "geral",
          titulo: "Geral",
          grupos: [
            { id: "geral", titulo: "Mesmo id da aba", campos: [] },
            { id: "x", titulo: "Ok", campos: [] },
          ],
        },
      ],
    });
    expect(layoutDocumentSchema.safeParse(d).success).toBe(false);
  });

  it("o mesmo campo referenciado duas vezes é recusado", () => {
    const d = doc({
      abas: [
        {
          id: "geral",
          titulo: "Geral",
          grupos: [
            { id: "a", titulo: "A", campos: [{ field_id: F1 }] },
            { id: "b", titulo: "B", campos: [{ field_id: F1 }] },
          ],
        },
      ],
    });
    expect(layoutDocumentSchema.safeParse(d).success).toBe(false);
  });

  it("limites: mais abas do que o teto é recusado", () => {
    const abas = Array.from({ length: LIMITES_DO_LAYOUT.abas + 1 }, (_, i) => ({
      id: `aba-${i}`,
      titulo: `Aba ${i}`,
      grupos: [],
    }));
    expect(layoutDocumentSchema.safeParse({ version: 1, abas }).success).toBe(false);
  });

  it("título vazio e id fora do padrão são recusados", () => {
    expect(
      layoutDocumentSchema.safeParse(doc({ abas: [{ id: "Geral!", titulo: "Geral", grupos: [] }] })).success,
    ).toBe(false);
    expect(
      layoutDocumentSchema.safeParse(doc({ abas: [{ id: "geral", titulo: "  ", grupos: [] }] })).success,
    ).toBe(false);
  });
});

describe("validarParaPublicar", () => {
  const catalogo = [
    { id: F1, entity_kind: "contact" as const, lifecycle: "active" as const },
    { id: F2, entity_kind: "contact" as const, lifecycle: "archived" as const },
  ];

  it("referência ativa passa", () => {
    expect(validarParaPublicar(doc(), catalogo)).toEqual({ ok: true });
  });

  it("campo arquivado e campo inexistente voltam na lista de problemas", () => {
    const d = doc({
      abas: [
        {
          id: "geral",
          titulo: "Geral",
          grupos: [
            {
              id: "a",
              titulo: "A",
              visivelQuando: { field_id: F2, valores: ["x"] },
              campos: [{ field_id: "33333333-3333-4333-8333-333333333333" }],
            },
          ],
        },
      ],
    });
    const r = validarParaPublicar(d, catalogo);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.fieldIds).toContain(F2);
      expect(r.fieldIds).toContain("33333333-3333-4333-8333-333333333333");
    }
  });

  it("definição de outra entidade não vale para a ficha do contato", () => {
    const r = validarParaPublicar(doc(), [{ id: F1, entity_kind: "lead", lifecycle: "active" }]);
    expect(r.ok).toBe(false);
  });
});

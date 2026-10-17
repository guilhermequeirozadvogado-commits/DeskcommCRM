/**
 * A FICHA DO CONTATO NUNCA INVENTA CAMPO.
 *
 * Até 2026-10 a ficha caía num modelo fixo do código (o pré-atendimento
 * jurídico de um escritório) em três situações: organização sem ficha
 * publicada, desenho ainda carregando e leitura que falhou. Os três casos têm
 * agora resposta própria, e este arquivo prende cada uma:
 *
 * - sem ficha publicada → estado vazio; quem administra ganha o atalho para
 *   Configurações → Fichas e campos, quem não administra ganha a instrução;
 * - leitura do desenho falhou → aviso com "tentar de novo", e NENHUM campo —
 *   trocar a ficha por outra faria quem atende achar que o dado sumiu;
 * - ficha publicada → os campos dela, e só eles.
 */
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { FichaDoContato } from "@/components/contacts/FichaDoContato";
import type { ModeloDaFicha } from "@/lib/crm-fields/tipos";

const estado = vi.hoisted(() => ({
  papel: "admin" as string,
  modelo: { isError: false, data: undefined as ModeloDaFicha | undefined, refetch: () => Promise.resolve() },
}));

vi.mock("@/hooks/auth/AuthProvider", () => ({
  useAuth: () => ({
    user: { id: "u-1", is_platform_admin: false, support: null },
    activeOrg: { orgId: "org-1", name: "Org", role: estado.papel },
  }),
}));
vi.mock("@/hooks/i18n/useT", () => ({ useT: () => (s: string) => s }));
vi.mock("@/hooks/crm-fields/useFichas", () => ({ useModeloDaFicha: () => estado.modelo }));
vi.mock("@/lib/api/client", () => ({
  apiClient: {
    get: () =>
      Promise.resolve({
        data: { custom_fields: { ficha_banco: "Banco Azul" }, cpf_available: false, birthdate: null, email: null },
      }),
    patch: vi.fn(),
  },
}));

const PUBLICADO: ModeloDaFicha = {
  releaseId: "r-1",
  abas: [
    {
      id: "geral",
      titulo: "Geral",
      grupos: [{ id: "contrato", titulo: "Contrato", campos: [{ chave: "ficha_banco", rotulo: "Banco", tipo: "texto" }] }],
    },
  ],
};

beforeEach(() => {
  estado.papel = "admin";
  estado.modelo = { isError: false, data: undefined, refetch: () => Promise.resolve() };
});

describe("ficha do contato — estados", () => {
  it("sem ficha publicada, quem administra vê o estado vazio com o atalho", async () => {
    estado.modelo.data = { releaseId: null, abas: [] };
    render(<FichaDoContato contactId="c-1" />);
    expect(await screen.findByTestId("ficha-do-contato-vazia")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Montar a ficha" })).toHaveAttribute("href", "/app/settings/fichas");
    expect(screen.queryByTestId("ficha-do-contato")).toBeNull();
  });

  it("sem ficha publicada, quem não administra vê a instrução, sem o atalho", async () => {
    estado.papel = "agent";
    estado.modelo.data = { releaseId: null, abas: [] };
    render(<FichaDoContato contactId="c-1" />);
    expect(await screen.findByTestId("ficha-do-contato-vazia")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Montar a ficha" })).toBeNull();
    expect(screen.getByText(/Peça a quem administra/)).toBeInTheDocument();
  });

  it("leitura do desenho falhou: aviso com tentar de novo, e nenhum campo", async () => {
    estado.modelo.isError = true;
    render(<FichaDoContato contactId="c-1" />);
    expect(await screen.findByRole("button", { name: "Tentar de novo" })).toBeInTheDocument();
    expect(screen.queryByTestId("ficha-do-contato")).toBeNull();
    expect(screen.queryByTestId("ficha-do-contato-vazia")).toBeNull();
  });

  it("ficha publicada: mostra os campos dela com o valor gravado", async () => {
    estado.modelo.data = PUBLICADO;
    render(<FichaDoContato contactId="c-1" />);
    expect(await screen.findByTestId("ficha-do-contato")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Banco Azul")).toBeInTheDocument();
  });
});

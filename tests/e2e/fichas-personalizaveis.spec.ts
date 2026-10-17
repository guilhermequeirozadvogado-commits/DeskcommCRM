/**
 * FICHAS E CAMPOS (migration 9001, fork QMZ) — a jornada inteira pela tela,
 * como um admin leigo faria: começar a personalizar, criar um campo novo,
 * colocá-lo num grupo, movê-lo, publicar — e ver o campo na ficha de um contato
 * real, salvar um valor por blur e encontrá-lo depois de recarregar.
 *
 * O que este spec NÃO cobre, de propósito: a equivalência da ficha SEM
 * publicação (quem guarda é `lib/crm-fields/padrao-do-contato.test.ts` mais o
 * fluxo de atendimento, que roda numa organização que não publicou nada) e o
 * conflito de publicação concorrente (guardado por teste de handler e pelo
 * invariante da função SQL).
 */
import { test, expect, type Page } from "./helpers/test";

import { lerCreds, loginComoAdmin } from "./helpers/login-admin";

const sufixo = `${process.pid}`.slice(-6);
const ROTULO = `Observação interna ${sufixo}`;
const NOME_CONTATO = `Contato Ficha ${sufixo}`;
const VALOR = `anotado pela ficha ${sufixo}`;

async function abrirFichas(page: Page): Promise<void> {
  await page.goto("/app/settings/fichas");
  await expect(page.getByRole("heading", { name: "Fichas e campos" })).toBeVisible({ timeout: 20_000 });
}

test("criar campo, publicar layout e ver o campo salvo na ficha do contato", async ({ page }) => {
  test.setTimeout(240_000);
  await loginComoAdmin(page, lerCreds());

  // 1. Bootstrap, quando esta organização ainda não personalizou nada. O botão
  //    só existe na primeira vez — o banco de e2e é compartilhado entre specs.
  await abrirFichas(page);
  const comecar = page.getByRole("button", { name: "Começar a personalizar" });
  if (await comecar.isVisible().catch(() => false)) {
    await comecar.click();
  }
  await expect(page.getByRole("tab", { name: "Catálogo de campos" })).toBeVisible({ timeout: 20_000 });

  // 2. Cria o campo novo no catálogo.
  await page.getByRole("tab", { name: "Catálogo de campos" }).click();
  await page.getByRole("button", { name: "Novo campo" }).click();
  await page.locator("#novo-rotulo").fill(ROTULO);
  await page.getByRole("button", { name: "Criar campo" }).click();
  await expect(page.getByRole("cell", { name: ROTULO })).toBeVisible({ timeout: 15_000 });

  // 3. Adiciona o campo ao primeiro grupo do layout e sobe uma posição.
  await page.getByRole("tab", { name: "Layout da ficha" }).click();
  await page.getByRole("combobox", { name: /Adicionar campo do catálogo/ }).first().click();
  await page.getByRole("option", { name: ROTULO }).click();
  const linhaDoCampo = page.locator("li", { hasText: ROTULO }).first();
  await expect(linhaDoCampo).toBeVisible();
  await linhaDoCampo.getByRole("button", { name: "Subir campo" }).click();

  // 4. Publica, confirmando o alcance no diálogo.
  await page.getByRole("button", { name: "Publicar", exact: true }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Publicar" }).click();
  await expect(page.getByText("Layout publicado", { exact: false })).toBeVisible({ timeout: 20_000 });

  // 5. Um contato real recebe o campo novo na ficha. A criação é pela API
  //    autenticada — o que está sob teste é a FICHA, não o formulário de criar.
  const criado = await page.request.post("/api/v1/contacts", {
    data: { display_name: NOME_CONTATO, source: "manual" },
  });
  expect(criado.status(), "não deu para criar o contato de teste").toBe(201);
  const corpo = (await criado.json()) as { data: { contact: { id: string } } };
  const contatoId = corpo.data.contact.id;

  await page.goto(`/app/contacts/${contatoId}`);
  const ficha = page.getByTestId("ficha-do-contato");
  await expect(ficha).toBeVisible({ timeout: 20_000 });
  const campoNaFicha = ficha.getByLabel(ROTULO, { exact: false });
  await expect(campoNaFicha).toBeVisible({ timeout: 20_000 });

  // 6. Blur salva; recarregar prova que ficou.
  await campoNaFicha.fill(VALOR);
  await campoNaFicha.blur();
  await expect(ficha.getByText("Salvo").first()).toBeAttached({ timeout: 15_000 });
  await page.reload();
  await expect(page.getByTestId("ficha-do-contato")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId("ficha-do-contato").getByLabel(ROTULO, { exact: false })).toHaveValue(VALOR, {
    timeout: 20_000,
  });
});

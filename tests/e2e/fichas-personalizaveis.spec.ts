/**
 * FICHAS E CAMPOS (migration 9001, fork QMZ) — a jornada inteira pela tela,
 * como um admin leigo faria numa instalação nova: ver a ficha vazia com o
 * atalho para montá-la, começar a personalizar (rascunho em branco), criar um
 * grupo e um campo, publicar — e ver o campo na ficha de um contato real,
 * salvar um valor por blur e encontrá-lo depois de recarregar.
 *
 * O banco de e2e é compartilhado entre specs e entre rodadas locais: a parte
 * da ficha VAZIA só é exercida quando a organização ainda não personalizou
 * nada (o botão "Começar a personalizar" é o sinal). No CI cada parte sobe um
 * banco novo, e é o caso. Os estados da ficha (vazio, erro, carregando) têm
 * prova determinística em `lib/crm-fields/` e no handler do resolve.
 *
 * O que este spec NÃO cobre, de propósito: o conflito de publicação
 * concorrente (guardado por teste de handler e pelo invariante da função SQL).
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
  //    O editor carrega por query no cliente: antes de decidir se clica, espere
  //    o estado CARREGADO (botão ou abas) — um isVisible() imediato lê o
  //    skeleton, devolve false e pula o bootstrap (foi a 1ª falha medida local).
  await abrirFichas(page);
  const comecar = page.getByRole("button", { name: "Começar a personalizar" });
  const abaCatalogo = page.getByRole("tab", { name: "Catálogo de campos" });
  await expect(comecar.or(abaCatalogo).first()).toBeVisible({ timeout: 20_000 });
  const organizacaoNova = await comecar.isVisible();
  if (organizacaoNova) {
    // 1a. Antes de qualquer personalização, a ficha do contato é VAZIA e
    //     mostra a quem administra o caminho para montá-la — nenhum campo vem
    //     do código.
    const vazio = await page.request.post("/api/v1/contacts", {
      data: { display_name: `${NOME_CONTATO} vazio`, source: "manual" },
    });
    expect(vazio.status(), "não deu para criar o contato da ficha vazia").toBe(201);
    const idVazio = ((await vazio.json()) as { data: { contact: { id: string } } }).data.contact.id;
    await page.goto(`/app/contacts/${idVazio}`);
    const fichaVazia = page.getByTestId("ficha-do-contato-vazia");
    await expect(fichaVazia).toBeVisible({ timeout: 20_000 });
    await expect(fichaVazia).toContainText("ainda não foi montada");
    await page.screenshot({ path: "evidence/ficha-juridica-fora-do-codigo/01-ficha-vazia-com-atalho.png", fullPage: true });
    await fichaVazia.getByRole("link", { name: "Montar a ficha" }).click();
    await expect(page.getByRole("heading", { name: "Fichas e campos" })).toBeVisible({ timeout: 20_000 });

    await comecar.click();
  }
  await expect(abaCatalogo).toBeVisible({ timeout: 20_000 });

  // 2. Cria o campo novo no catálogo.
  await page.getByRole("tab", { name: "Catálogo de campos" }).click();
  await page.getByRole("button", { name: "Novo campo" }).click();
  await page.locator("#novo-rotulo").fill(ROTULO);
  await page.getByRole("button", { name: "Criar campo" }).click();
  await expect(page.getByRole("cell", { name: ROTULO })).toBeVisible({ timeout: 15_000 });

  // 3. Adiciona o campo ao primeiro grupo do layout (criando o grupo, se o
  //    rascunho ainda está em branco) e sobe uma posição quando há como.
  await page.getByRole("tab", { name: "Layout da ficha" }).click();
  const adicionar = page.getByRole("combobox", { name: /Adicionar campo do catálogo/ });
  const semGrupo = page.getByText("Aba sem grupos", { exact: false });
  await expect(adicionar.first().or(semGrupo)).toBeVisible({ timeout: 15_000 });
  if (await semGrupo.isVisible()) {
    await page.getByRole("button", { name: "Grupo", exact: true }).click();
  }
  await adicionar.first().click();
  await page.getByRole("option", { name: ROTULO }).click();
  const linhaDoCampo = page.locator("li", { hasText: ROTULO }).first();
  await expect(linhaDoCampo).toBeVisible();
  const subir = linhaDoCampo.getByRole("button", { name: "Subir campo" });
  if (await subir.isEnabled()) await subir.click();

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
  if (organizacaoNova) {
    await page.screenshot({ path: "evidence/ficha-juridica-fora-do-codigo/02-ficha-montada-pela-tela.png", fullPage: true });
  }

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

import { beforeAll, describe, expect, it } from "vitest";

import {
  GOV_ADMIN,
  GOV_ORG,
  GOV_VIEWER,
  countAs,
  lastLine,
  seedGov,
  sql,
  writeCountAs,
} from "./gov-helpers";

/**
 * Layout publicável da ficha do contato (migration 9001, fork QMZ). Roda só via
 * `pnpm test:db`. `crm_field_definitions` entra no laço de `rls-isolation.test.ts`;
 * as duas tabelas de layout têm prova própria aqui (PROVA_PROPRIA na varredura),
 * porque os eixos delas não cabem no molde de lá:
 *
 *   1. ISOLAMENTO: organização B não lê ponteiro, release nem catálogo de A.
 *   2. ESCRITA SÓ DO SERVIDOR: nem o ADMIN escreve pelo PostgREST — as três
 *      tabelas negam escrita no GRANT (42501, nem RLS é consultada): a migration
 *      9001 revoga tudo de authenticated e devolve só SELECT; toda mutação passa
 *      pelas rotas (que revalidam papel e usam service role).
 *   3. ANTI-CRUZAMENTO NO SCHEMA: a FK composta (organization_id, id) impede
 *      release de A em layout de B — mesmo para quem ignora RLS.
 *   4. PUBLICAÇÃO COM CAS: `fn_publish_record_layout` publica v1, recusa a
 *      release esperada divergente (errcode 55000) e publica v2 com a esperada
 *      certa, consumindo o rascunho na mesma transação.
 */

const ORG_B = "9c010000-0000-4000-8000-00000000000b";
const USER_B = "9c010000-1111-4000-8000-00000000000b";

const LAYOUT_A = "9c010000-2222-4000-8000-000000000001";
const LAYOUT_B = "9c010000-2222-4000-8000-00000000000b";
const CAMPO_A = "9c010000-3333-4000-8000-000000000001";

const DOC = `'{"version": 1, "abas": [{"id": "geral", "titulo": "Geral", "grupos": []}]}'::jsonb`;

beforeAll(() => {
  seedGov();
  sql(`
    insert into auth.users (id, email) values ('${USER_B}', 'layouts-b@invariant.test') on conflict (id) do nothing;
    insert into public.organizations (id, slug, legal_name, display_name)
      values ('${ORG_B}', 'layouts-inv-b', 'Layouts B', 'Layouts B') on conflict (id) do nothing;
    insert into public.user_organizations (user_id, organization_id, role, accepted_at)
      values ('${USER_B}', '${ORG_B}', 'admin', now()) on conflict do nothing;

    insert into public.crm_field_definitions (id, organization_id, entity_kind, api_key, storage_key, field_type, label)
      values ('${CAMPO_A}', '${GOV_ORG}', 'contact', 'banco_inv', 'ficha_banco_inv', 'text', 'Banco (invariante)')
      on conflict (id) do nothing;
    insert into public.crm_record_layouts (id, organization_id, entity_kind, draft_document)
      values ('${LAYOUT_A}', '${GOV_ORG}', 'contact', ${DOC})
      on conflict (id) do nothing;
    insert into public.crm_record_layouts (id, organization_id, entity_kind)
      values ('${LAYOUT_B}', '${ORG_B}', 'contact')
      on conflict (id) do nothing;
  `);
});

describe("isolamento entre organizações", () => {
  it("as três tabelas existem (controle contra verde por vazio)", () => {
    expect(
      lastLine(
        sql(`select count(*) from information_schema.tables where table_schema='public'
               and table_name in ('crm_field_definitions','crm_record_layouts','crm_record_layout_releases');`),
      ),
    ).toBe("3");
  });

  it("admin de B não lê o layout nem o catálogo de A; viewer de A lê (controle)", () => {
    expect(countAs(USER_B, `select count(*) from public.crm_record_layouts where organization_id = '${GOV_ORG}';`)).toBe(0);
    expect(countAs(USER_B, `select count(*) from public.crm_field_definitions where organization_id = '${GOV_ORG}';`)).toBe(0);
    expect(countAs(GOV_VIEWER, `select count(*) from public.crm_record_layouts where id = '${LAYOUT_A}';`)).toBe(1);
    expect(countAs(GOV_VIEWER, `select count(*) from public.crm_field_definitions where id = '${CAMPO_A}';`)).toBe(1);
  });
});

describe("escrita é só do servidor", () => {
  it("nem o admin escreve pelo PostgREST: as três tabelas negam no GRANT (permission denied)", () => {
    const escritas = [
      `insert into public.crm_record_layouts (organization_id, entity_kind) values ('${GOV_ORG}', 'lead')`,
      `update public.crm_record_layouts set draft_revision = 99 where id = '${LAYOUT_A}'`,
      `delete from public.crm_field_definitions where id = '${CAMPO_A}'`,
      `insert into public.crm_field_definitions (organization_id, entity_kind, api_key, storage_key, field_type, label)
         values ('${GOV_ORG}', 'contact', 'x_inv', 'ficha_x_inv', 'text', 'X')`,
      `insert into public.crm_record_layout_releases (organization_id, layout_id, version, document)
         values ('${GOV_ORG}', '${LAYOUT_A}', 999, ${DOC})`,
    ];
    for (const dml of escritas) {
      expect(() => writeCountAs(GOV_ADMIN, dml)).toThrow(/permission denied for table/);
    }
  });
});

describe("anti-cruzamento no schema (vale até para quem ignora RLS)", () => {
  it("release com layout de OUTRA organização é recusada pela FK composta", () => {
    expect(() =>
      sql(`insert into public.crm_record_layout_releases (organization_id, layout_id, version, document)
             values ('${ORG_B}', '${LAYOUT_A}', 1, ${DOC});`),
    ).toThrow(/foreign key|fk/i);
  });

  it("ponteiro de A não aceita release de B", () => {
    sql(`insert into public.crm_record_layout_releases (id, organization_id, layout_id, version, document)
           values ('9c010000-4444-4000-8000-00000000000b', '${ORG_B}', '${LAYOUT_B}', 1, ${DOC})
           on conflict (id) do nothing;`);
    expect(() =>
      sql(`update public.crm_record_layouts
             set active_release_id = '9c010000-4444-4000-8000-00000000000b'
           where id = '${LAYOUT_A}';`),
    ).toThrow(/foreign key|fk/i);
  });
});

describe("fn_publish_record_layout: CAS e consumo do rascunho", () => {
  it("publica v1, recusa esperada divergente e publica v2 com a esperada certa", () => {
    const v1 = lastLine(
      sql(`select public.fn_publish_record_layout('${GOV_ORG}', '${LAYOUT_A}', ${DOC}, null, null);`),
    );
    expect(v1).toMatch(/^[0-9a-f-]{36}$/);

    const estado = lastLine(
      sql(`select (active_release_id = '${v1}')::text || '|' || (draft_document is null)::text
             from public.crm_record_layouts where id = '${LAYOUT_A}';`),
    );
    expect(estado).toBe("true|true");
    expect(
      lastLine(sql(`select version::text from public.crm_record_layout_releases where id = '${v1}';`)),
    ).toBe("1");

    // CAS: quem publica achando que nunca houve release (expected null) perde.
    expect(() =>
      sql(`select public.fn_publish_record_layout('${GOV_ORG}', '${LAYOUT_A}', ${DOC}, null, null);`),
    ).toThrow(/release ativa divergente/);

    const v2 = lastLine(
      sql(`select public.fn_publish_record_layout('${GOV_ORG}', '${LAYOUT_A}', ${DOC}, '${v1}', null);`),
    );
    expect(
      lastLine(sql(`select version::text from public.crm_record_layout_releases where id = '${v2}';`)),
    ).toBe("2");
  });

  it("layout de outra organização não publica nem com o id certo (org errada = não encontrado)", () => {
    expect(() =>
      sql(`select public.fn_publish_record_layout('${ORG_B}', '${LAYOUT_A}', ${DOC}, null, null);`),
    ).toThrow(/layout não encontrado/);
  });
});

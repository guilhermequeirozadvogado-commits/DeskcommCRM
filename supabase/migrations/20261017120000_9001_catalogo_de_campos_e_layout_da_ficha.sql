-- manifest: **Catálogo de campos com identidade estável + layout publicável da ficha do contato (fork QMZ, F1+F2 do estudo Kommo).** Cria `crm_field_definitions` (campo com UUID imutável, `api_key`/`storage_key` separados do rótulo — renomear nunca órfã valor —, opções jsonb com id estável, ciclo active/archived), `crm_record_layouts` (ponteiro + rascunho embutido, 1 por organização+entidade, CAS por `draft_revision`, padrão followup_flow_pointers) e `crm_record_layout_releases` (snapshots imutáveis do layout, FK composta anti-cruzamento de organização). A publicação é `fn_publish_record_layout`: lock da linha, CAS da release esperada (divergiu → errcode 55000, a rota devolve 409), insert `version = max+1`, troca do ponteiro e consumo do rascunho numa transação. Sem release publicada a ficha usa o modelo do código (`FICHA_DO_CONTATO`) — instalação fresca fica idêntica à de hoje. O NNNN 9001 é faixa reservada do fork: o upstream já passou da 0692 e a sequência colidiria no próximo sync. Idempotente; apêndice igual no `baseline.sql`.
-- 9001: catálogo de campos e layout da ficha — a identidade sai do rótulo.
--
-- ─── O defeito ──────────────────────────────────────────────────────────────
--
-- A ficha do contato é uma constante TypeScript (`FICHA_DO_CONTATO`): criar um
-- campo, renomear um grupo ou mudar a ordem exige deploy. Nos campos de funil o
-- problema é pior: a `key` de `pipeline.settings.fields` é ao mesmo tempo a
-- identidade e a chave de armazenamento — renomear a chave deixa os valores
-- antigos órfãos, e não há draft, versão nem CAS (duas edições se sobrescrevem).
--
-- ─── O desenho ──────────────────────────────────────────────────────────────
--
-- Catálogo SOBRE os dados existentes, não EAV: os valores continuam em
-- `contacts.custom_fields`; cada definição carrega o binding (`storage_key`,
-- imutável) e a identidade de API (`api_key`, imutável). Opções moram em
-- `options` jsonb com `id` estável — no seed do legado o id É o literal já
-- gravado ("RCV", "Sim"…), então nenhum valor migra. O layout (abas → grupos →
-- campos) é um documento jsonb versionado: rascunho no ponteiro (CAS por
-- `draft_revision`), snapshot imutável na release, troca de ponteiro só pela
-- função de publicação. `entity_kind` já aceita 'lead' para o próximo
-- incremento não precisar de ALTER; as rotas deste só aceitam 'contact'.

-- ─── 1. Catálogo de definições ──────────────────────────────────────────────

create table if not exists public.crm_field_definitions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  entity_kind text not null check (entity_kind in ('contact', 'lead')),
  -- Identidade para API/integrações. Imutável desde a criação (a rota recusa PATCH).
  api_key text not null check (api_key ~ '^[a-z][a-z0-9_]{0,62}$'),
  -- O binding: a chave em `custom_fields` (legada `ficha_*` ou nova) ou o nome
  -- da coluna nativa. Imutável. Renomear o rótulo nunca toca aqui.
  storage_key text not null check (storage_key ~ '^[a-z][a-z0-9_]{0,62}$'),
  -- null = o valor mora em custom_fields; senão, a coluna própria do contato.
  native_binding text check (native_binding in ('cpf', 'birthdate', 'email')),
  -- 'protected' existe só para o seed de `ficha_senha_segredo`; a rota recusa
  -- criar campo protegido novo até existir armazenamento cifrado de verdade.
  field_type text not null check (field_type in
    ('text', 'textarea', 'number', 'currency', 'date', 'select', 'multiselect',
     'boolean', 'email', 'phone', 'url', 'protected')),
  label text not null,
  hint text,
  -- [{"id": "rcv", "label": "RCV", "archived": false}] — id estável; o Zod da
  -- rota valida unicidade e só permite renomear label/arquivar, nunca trocar id.
  options jsonb not null default '[]'::jsonb,
  lifecycle text not null default 'active' check (lifecycle in ('active', 'archived')),
  -- 'ficha_do_contato' quando semeada do código; null quando criada pelo admin.
  seeded_from text,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  unique (organization_id, entity_kind, api_key),
  unique (organization_id, entity_kind, storage_key)
);

create index if not exists crm_field_definitions_org_idx
  on public.crm_field_definitions (organization_id, entity_kind, lifecycle);

alter table public.crm_field_definitions enable row level security;
drop policy if exists tenant_isolation_crm_field_definitions_select on public.crm_field_definitions;
create policy tenant_isolation_crm_field_definitions_select on public.crm_field_definitions
  for select using (organization_id in (select public.fn_user_org_ids()));
revoke all on public.crm_field_definitions from public, anon, authenticated;
grant select on public.crm_field_definitions to authenticated;
grant all on public.crm_field_definitions to service_role;

-- ─── 2. Ponteiro do layout (com o rascunho embutido) ────────────────────────

create table if not exists public.crm_record_layouts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  entity_kind text not null check (entity_kind in ('contact', 'lead')),
  -- O rascunho (padrão followup_flow_pointers.draft_graph). null = nada pendente.
  draft_document jsonb,
  draft_revision integer not null default 0,
  draft_base_release_id uuid,
  -- null = sem publicação: a ficha usa o modelo do código (fallback seguro).
  active_release_id uuid,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, entity_kind),
  unique (organization_id, id)
);

alter table public.crm_record_layouts enable row level security;
drop policy if exists tenant_isolation_crm_record_layouts_select on public.crm_record_layouts;
create policy tenant_isolation_crm_record_layouts_select on public.crm_record_layouts
  for select using (organization_id in (select public.fn_user_org_ids()));
revoke all on public.crm_record_layouts from public, anon, authenticated;
grant select on public.crm_record_layouts to authenticated;
grant all on public.crm_record_layouts to service_role;

-- ─── 3. Releases imutáveis ──────────────────────────────────────────────────

create table if not exists public.crm_record_layout_releases (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  layout_id uuid not null,
  version integer not null,
  document jsonb not null,
  created_by uuid,
  created_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (layout_id, version),
  -- FK composta anti-cruzamento: release de uma organização nunca aponta para
  -- layout de outra, nem com service role (padrão prospecting_campaigns).
  foreign key (organization_id, layout_id)
    references public.crm_record_layouts (organization_id, id) on delete cascade
);

alter table public.crm_record_layout_releases enable row level security;
drop policy if exists tenant_isolation_crm_record_layout_releases_select on public.crm_record_layout_releases;
create policy tenant_isolation_crm_record_layout_releases_select on public.crm_record_layout_releases
  for select using (organization_id in (select public.fn_user_org_ids()));
revoke all on public.crm_record_layout_releases from public, anon, authenticated;
grant select on public.crm_record_layout_releases to authenticated;
grant all on public.crm_record_layout_releases to service_role;

-- FKs de volta do ponteiro para a release, compostas pela mesma razão. São
-- circulares (layouts ↔ releases), então entram depois das duas tabelas,
-- idempotentes pelo catálogo.
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'crm_record_layouts_active_release_fk') then
    alter table public.crm_record_layouts
      add constraint crm_record_layouts_active_release_fk
      foreign key (organization_id, active_release_id)
      references public.crm_record_layout_releases (organization_id, id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'crm_record_layouts_draft_base_release_fk') then
    alter table public.crm_record_layouts
      add constraint crm_record_layouts_draft_base_release_fk
      foreign key (organization_id, draft_base_release_id)
      references public.crm_record_layout_releases (organization_id, id);
  end if;
end $$;

-- ─── 4. A publicação: uma transação, com CAS ────────────────────────────────
--
-- Publicar são DUAS escritas (insert da release + troca do ponteiro). Fora de
-- uma função, uma corrida deixaria release órfã com número de versão consumido.
-- Aqui: lock da linha do ponteiro serializa publicações concorrentes; a release
-- esperada divergente vira errcode 55000 (a rota traduz para 409
-- `model_conflict`); o rascunho é consumido na mesma transação.
create or replace function public.fn_publish_record_layout(
  p_org uuid,
  p_layout uuid,
  p_document jsonb,
  p_expected_release uuid,
  p_actor uuid
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_atual uuid;
  v_versao integer;
  v_release uuid;
begin
  if p_document is null or jsonb_typeof(p_document) is distinct from 'object' then
    raise exception 'documento de layout inválido' using errcode = '22023';
  end if;

  select active_release_id into v_atual
    from public.crm_record_layouts
   where id = p_layout and organization_id = p_org
   for update;
  if not found then
    raise exception 'layout não encontrado' using errcode = 'P0002';
  end if;
  if v_atual is distinct from p_expected_release then
    raise exception 'release ativa divergente' using errcode = '55000';
  end if;

  select coalesce(max(version), 0) + 1 into v_versao
    from public.crm_record_layout_releases
   where layout_id = p_layout;

  insert into public.crm_record_layout_releases
    (organization_id, layout_id, version, document, created_by)
  values (p_org, p_layout, v_versao, p_document, p_actor)
  returning id into v_release;

  update public.crm_record_layouts
     set active_release_id = v_release,
         draft_document = null,
         draft_base_release_id = v_release,
         draft_revision = draft_revision + 1,
         updated_by = p_actor,
         updated_at = now()
   where id = p_layout and organization_id = p_org;

  return v_release;
end;
$$;

revoke execute on function public.fn_publish_record_layout(uuid, uuid, jsonb, uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.fn_publish_record_layout(uuid, uuid, jsonb, uuid, uuid)
  to service_role;

notify pgrst, 'reload schema';

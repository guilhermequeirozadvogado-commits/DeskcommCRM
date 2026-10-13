-- manifest: **Anotações permanentes do contato.** Coluna `contacts.notes` (texto livre, até 10.000 caracteres, CHECK `contacts_notes_tamanho` criado depois de truncar o que passar) para a equipe registrar na ficha do contato o que vale para todas as conversas; editada pelo painel do Inbox e pelo `PATCH /api/v1/contacts/[id]`. LGPD: gatilho `trg_contacts_notes_apaga_na_anonimizacao` zera a coluna quando `is_anonymized` vira true, e os contatos já anonimizados são limpos na aplicação. Mesmo bloco no apêndice do `supabase/baseline.sql`, antes da VARREDURA anon.

-- ---- anotações permanentes do contato (migration 0655) ----
-- Texto livre que a equipe escreve na ficha do contato e que fica com ele em
-- todas as conversas. Não é a "Memória do contato" (fatos extraídos das notas
-- da conversa pela IA): é a anotação humana, editável, de um só lugar.
--
-- LGPD: o texto é dado pessoal sem estrutura, então a anonimização tem de
-- apagá-lo. Em vez de reescrever `fn_lgpd_cascade_redact_contact` (que tem
-- várias definições neste arquivo), um gatilho BEFORE UPDATE zera a coluna no
-- instante em que `is_anonymized` vira true — vale para qualquer caminho que
-- anonimize, inclusive os que vierem depois.
alter table public.contacts add column if not exists notes text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.contacts'::regclass and conname = 'contacts_notes_tamanho'
  ) then
    -- Corrige antes de criar a regra: um clone que já tenha texto maior não quebra.
    update public.contacts set notes = left(notes, 10000) where length(notes) > 10000;
    alter table public.contacts
      add constraint contacts_notes_tamanho check (notes is null or length(notes) <= 10000);
  end if;
end $$;

comment on column public.contacts.notes is
  'Anotações permanentes da equipe sobre o contato (texto livre, até 10.000 caracteres). Zerada na anonimização (LGPD).';

create or replace function public.fn_contacts_notes_apaga_na_anonimizacao()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.is_anonymized and not coalesce(old.is_anonymized, false) then
    new.notes := null;
  end if;
  return new;
end;
$$;
revoke execute on function public.fn_contacts_notes_apaga_na_anonimizacao() from public, anon, authenticated;

drop trigger if exists trg_contacts_notes_apaga_na_anonimizacao on public.contacts;
create trigger trg_contacts_notes_apaga_na_anonimizacao
  before update of is_anonymized on public.contacts
  for each row execute function public.fn_contacts_notes_apaga_na_anonimizacao();

-- Contato que já foi anonimizado não guarda anotação.
update public.contacts set notes = null where is_anonymized and notes is not null;


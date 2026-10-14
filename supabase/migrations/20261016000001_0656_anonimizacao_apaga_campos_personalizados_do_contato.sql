-- manifest: **A anonimização (LGPD) apaga também `contacts.custom_fields`.** `fn_lgpd_cascade_redact_contact` zerava nome, e-mail, telefone, CPF e nascimento mas deixava os campos personalizados do contato, onde a ficha do contato guarda CPF do titular, endereço e a chave de processo em segredo de justiça. O gatilho da 0655 (`trg_contacts_notes_apaga_na_anonimizacao`) passa a zerar `notes` e `custom_fields` quando `is_anonymized` vira true; contatos já anonimizados são limpos na aplicação. Mesmo bloco no apêndice do `supabase/baseline.sql`, antes da VARREDURA anon.

-- ---- a anonimização apaga também os campos personalizados do contato (migration 0656) ----
-- `fn_lgpd_cascade_redact_contact` zera nome, e-mail, telefone, CPF e
-- nascimento, mas NÃO tocava em `contacts.custom_fields` — e é ali que a ficha
-- do contato guarda CPF do titular, endereço e a chave do processo em segredo
-- de justiça. O gatilho da 0655 (que já zerava `notes`) passa a zerar os dois,
-- no mesmo instante em que `is_anonymized` vira true, por qualquer caminho.
create or replace function public.fn_contacts_notes_apaga_na_anonimizacao()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.is_anonymized and not coalesce(old.is_anonymized, false) then
    new.notes := null;
    new.custom_fields := '{}'::jsonb;
  end if;
  return new;
end;
$$;
revoke execute on function public.fn_contacts_notes_apaga_na_anonimizacao() from public, anon, authenticated;

-- Contato que já foi anonimizado não guarda campo personalizado.
update public.contacts set custom_fields = '{}'::jsonb
 where is_anonymized and custom_fields is distinct from '{}'::jsonb;


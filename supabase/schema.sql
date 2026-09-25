-- =====================================================================
--  Oficinas · schema do banco (Supabase / Postgres)
--  Rode este arquivo PRIMEIRO no SQL Editor do Supabase.
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------- Oficinas -------------------------------------------------
create table if not exists oficinas (
  id          uuid primary key default gen_random_uuid(),
  nome        text not null unique,
  ativa       boolean not null default true,
  created_at  timestamptz not null default now()
);

-- ---------- Modelos --------------------------------------------------
create table if not exists modelos (
  id          uuid primary key default gen_random_uuid(),
  nome        text not null unique,
  tipo        text not null check (tipo in ('Calcinha','Conjunto','Body')),
  codigo      text,
  ativo       boolean not null default true,
  created_at  timestamptz not null default now()
);

-- ---------- Preços ---------------------------------------------------
-- Costura: preço por OFICINA x MODELO   (modelo_id preenchido, tipo nulo)
-- Corte:   preço por OFICINA x TIPO     (tipo preenchido, modelo_id nulo)
-- Cada mudança de preço vira uma nova linha com "vigente_desde".
-- As entradas guardam o valor do dia, então mudar o preço não altera o passado.
create table if not exists precos (
  id             uuid primary key default gen_random_uuid(),
  oficina_id     uuid not null references oficinas(id) on delete cascade,
  operacao       text not null check (operacao in ('Costura','Corte')),
  modelo_id      uuid references modelos(id) on delete cascade,
  tipo           text check (tipo in ('Calcinha','Conjunto','Body')),
  valor          numeric(10,4) not null check (valor >= 0),
  vigente_desde  date not null default current_date,
  created_at     timestamptz not null default now(),
  constraint precos_alvo_ok check (
    (operacao = 'Costura' and modelo_id is not null and tipo is null) or
    (operacao = 'Corte'   and tipo is not null     and modelo_id is null)
  )
);
create unique index if not exists precos_costura_uq
  on precos (oficina_id, modelo_id, vigente_desde) where operacao = 'Costura';
create unique index if not exists precos_corte_uq
  on precos (oficina_id, tipo, vigente_desde) where operacao = 'Corte';

-- ---------- Entradas (peças recebidas) -------------------------------
create table if not exists entradas (
  id              uuid primary key default gen_random_uuid(),
  data            date not null,
  oficina_id      uuid not null references oficinas(id) on delete restrict,
  operacao        text not null check (operacao in ('Costura','Corte')),
  tipo            text not null check (tipo in ('Calcinha','Conjunto','Body')),
  modelo_id       uuid references modelos(id) on delete restrict,
  tamanho         text,
  quantidade      integer not null check (quantidade > 0),
  valor_unitario  numeric(10,4) check (valor_unitario >= 0),
  valor_total     numeric(14,4) generated always as (quantidade * valor_unitario) stored,
  observacao      text,
  created_at      timestamptz not null default now(),
  constraint entradas_costura_tem_modelo check (operacao = 'Corte' or modelo_id is not null)
);
create index if not exists entradas_data_idx    on entradas (data);
create index if not exists entradas_oficina_idx on entradas (oficina_id, data);

-- ---------- Pagamentos -----------------------------------------------
create table if not exists pagamentos (
  id          uuid primary key default gen_random_uuid(),
  data        date not null,
  oficina_id  uuid not null references oficinas(id) on delete restrict,
  valor       numeric(12,2) not null check (valor <> 0),
  observacao  text,
  created_at  timestamptz not null default now()
);
create index if not exists pagamentos_oficina_idx on pagamentos (oficina_id, data);

-- ---------- Preço vigente numa data ----------------------------------
create or replace function preco_vigente(
  p_oficina uuid, p_operacao text, p_modelo uuid, p_tipo text, p_data date
) returns numeric language sql stable as $$
  select valor from precos
   where oficina_id = p_oficina
     and operacao   = p_operacao
     and vigente_desde <= p_data
     and (
       (p_operacao = 'Costura' and modelo_id = p_modelo) or
       (p_operacao = 'Corte'   and tipo      = p_tipo)
     )
   order by vigente_desde desc
   limit 1
$$;

-- Preenche o tipo (a partir do modelo) e o valor unitário (pela tabela de preços)
-- quando vierem vazios. Serve para lançamentos, edições e importações.
create or replace function entradas_preencher() returns trigger language plpgsql as $$
begin
  if new.operacao = 'Costura' and new.modelo_id is not null then
    select tipo into new.tipo from modelos where id = new.modelo_id;
  end if;
  if new.operacao = 'Corte' then
    new.modelo_id := null;
    new.tamanho   := null;
  end if;
  if new.valor_unitario is null then
    new.valor_unitario := preco_vigente(new.oficina_id, new.operacao, new.modelo_id, new.tipo, new.data);
    if new.valor_unitario is null then
      raise exception 'Sem preço cadastrado para % de % nesta oficina em %',
        lower(new.operacao),
        coalesce((select nome from modelos where id = new.modelo_id), new.tipo),
        to_char(new.data, 'DD/MM/YYYY');
    end if;
  end if;
  return new;
end $$;

drop trigger if exists entradas_preencher_trg on entradas;
create trigger entradas_preencher_trg
  before insert or update on entradas
  for each row execute function entradas_preencher();

-- ---------- Segurança: só usuários logados leem e escrevem ------------
alter table oficinas   enable row level security;
alter table modelos    enable row level security;
alter table precos     enable row level security;
alter table entradas   enable row level security;
alter table pagamentos enable row level security;

do $$
declare t text;
begin
  foreach t in array array['oficinas','modelos','precos','entradas','pagamentos'] loop
    execute format('drop policy if exists "logado_tudo" on %I', t);
    execute format('create policy "logado_tudo" on %I for all to authenticated using (true) with check (true)', t);
  end loop;
end $$;

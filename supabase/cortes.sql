-- =====================================================================
--  Oficinas · módulo de CORTES
--  Rode este arquivo no SQL Editor do Supabase DEPOIS do schema.sql
--  (o banco que já está no ar). Pode ser rodado mais de uma vez.
-- =====================================================================

-- ---------- Oficinas passam a ter funções: costura e/ou corte ----------
alter table oficinas add column if not exists faz_costura boolean not null default true;
alter table oficinas add column if not exists faz_corte   boolean not null default false;
-- quem já recebeu pagamento de corte continua podendo cortar
update oficinas o set faz_corte = true
 where exists (select 1 from entradas e where e.oficina_id = o.id and e.operacao = 'Corte');

-- ---------- Cores --------------------------------------------------------
create table if not exists cores (
  id          uuid primary key default gen_random_uuid(),
  nome        text not null unique,
  ativa       boolean not null default true,
  created_at  timestamptz not null default now()
);

-- ---------- Insumos (aviamentos, tecidos) e a regra de compra -----------
-- consumo na ficha técnica é em "unidade_consumo" (m, kg, un) por peça.
-- compra = arredonda_para_cima( (consumo_total / fator) / multiplo ) * multiplo
--   fator:    quanto de consumo cabe em 1 unidade de compra (rolo de 100 m -> 100; 1 par = 2 un -> 2)
--   multiplo: compra em múltiplos de X unidades de compra (pacote de 50 pares -> 50; meio quilo -> 0.5)
--             vazio = não arredonda
--   por_cor:  calcula e compra separado por cor (falso = uma quantidade só para o corte todo)
create table if not exists insumos (
  id               uuid primary key default gen_random_uuid(),
  nome             text not null unique,
  unidade_consumo  text not null default 'un',
  unidade_compra   text not null default 'Un',
  fator            numeric(12,4) not null default 1 check (fator > 0),
  multiplo         numeric(12,4) check (multiplo is null or multiplo > 0),
  por_cor          boolean not null default true,
  no_pedido        boolean not null default true,   -- aparece no pedido de material por padrão
  ativo            boolean not null default true,
  created_at       timestamptz not null default now()
);

-- ---------- Ficha técnica: consumo de cada insumo por peça do modelo -----
create table if not exists ficha_tecnica (
  modelo_id  uuid not null references modelos(id) on delete cascade,
  insumo_id  uuid not null references insumos(id) on delete cascade,
  consumo    numeric(12,5) not null check (consumo >= 0),
  primary key (modelo_id, insumo_id)
);

-- ---------- Cortes -------------------------------------------------------
create table if not exists cortes (
  id                uuid primary key default gen_random_uuid(),
  numero            integer not null unique,
  nome              text not null,
  data              date not null default current_date,
  status            text not null default 'planejado'
                    check (status in ('planejado','cortado','enviado','concluido')),
  cortador_id       uuid references oficinas(id) on delete restrict,  -- vazio = fábrica
  data_cortado      date,
  data_enviado      date,
  -- dados do risco (Audaces)
  tecido            text,
  comprimento_m     numeric(10,3),
  largura_m         numeric(10,3),
  gramatura_kg_m2   numeric(10,4),
  aproveitamento    numeric(6,2),
  tecido_insumo_id  uuid references insumos(id) on delete set null,  -- qual insumo é o tecido do risco
  observacao        text,
  created_at        timestamptz not null default now()
);

-- modelos do corte: grade por folha (ex.: {"P":1,"M":2,"G":4,"GG":4}) e a oficina que costura
create table if not exists corte_modelos (
  id          uuid primary key default gen_random_uuid(),
  corte_id    uuid not null references cortes(id) on delete cascade,
  modelo_id   uuid not null references modelos(id) on delete restrict,
  oficina_id  uuid references oficinas(id) on delete restrict,
  grade       jsonb not null default '{}'::jsonb,
  ordem       integer not null default 0,
  unique (corte_id, modelo_id)
);

-- cores do corte e quantas folhas de cada
create table if not exists corte_cores (
  id        uuid primary key default gen_random_uuid(),
  corte_id  uuid not null references cortes(id) on delete cascade,
  cor_id    uuid not null references cores(id) on delete restrict,
  folhas    integer not null check (folhas >= 0),
  ordem     integer not null default 0,
  unique (corte_id, cor_id)
);

-- itens marcáveis do corte (lista de compras, etiquetas):
--   chave 'mat:<insumo>'          incluido = aparece no pedido deste corte
--   chave 'mat:<insumo>:<cor|*>'  feito = comprado
--   chave 'tag:<modelo>:<tam>'    feito = tags impressas
--   chave 'comp:<tam>'            feito = composição impressa
create table if not exists corte_itens (
  corte_id  uuid not null references cortes(id) on delete cascade,
  chave     text not null,
  incluido  boolean,
  feito     boolean not null default false,
  primary key (corte_id, chave)
);

-- entradas geradas automaticamente pelo corte (pagamento do cortador)
alter table entradas add column if not exists corte_id uuid references cortes(id) on delete set null;
create index if not exists entradas_corte_idx on entradas (corte_id);

-- ---------- Segurança: só usuários logados ------------------------------
alter table cores          enable row level security;
alter table insumos        enable row level security;
alter table ficha_tecnica  enable row level security;
alter table cortes         enable row level security;
alter table corte_modelos  enable row level security;
alter table corte_cores    enable row level security;
alter table corte_itens    enable row level security;

do $$
declare t text;
begin
  foreach t in array array['cores','insumos','ficha_tecnica','cortes','corte_modelos','corte_cores','corte_itens'] loop
    execute format('drop policy if exists "logado_tudo" on %I', t);
    execute format('create policy "logado_tudo" on %I for all to authenticated using (true) with check (true)', t);
  end loop;
end $$;

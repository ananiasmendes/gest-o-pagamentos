-- =====================================================================
--  Oficinas · PRECIFICAÇÃO + AJUSTES
--  Rode DEPOIS do cortes.sql. Pode ser rodado mais de uma vez.
-- =====================================================================

-- ---------- Tipo "Pijama" -------------------------------------------------
alter table modelos  drop constraint if exists modelos_tipo_check;
alter table modelos  add  constraint modelos_tipo_check  check (tipo in ('Calcinha','Conjunto','Body','Pijama'));
alter table precos   drop constraint if exists precos_tipo_check;
alter table precos   add  constraint precos_tipo_check   check (tipo in ('Calcinha','Conjunto','Body','Pijama'));
alter table entradas drop constraint if exists entradas_tipo_check;
alter table entradas add  constraint entradas_tipo_check check (tipo in ('Calcinha','Conjunto','Body','Pijama'));

-- ---------- Modelos: preço de venda atual ---------------------------------
alter table modelos add column if not exists preco_venda numeric(10,2);
alter table modelos add column if not exists sem_costura boolean not null default false; -- ex.: pijama comprado pronto

-- ---------- Pagamentos: tipo "ajuste" -------------------------------------
-- Ajuste acerta o saldo sem ser dinheiro pago (arredondamentos, diferenças antigas).
-- Entra no saldo, mas não no total pago nem no prazo médio de pagamento.
alter table pagamentos add column if not exists tipo text not null default 'pagamento';
alter table pagamentos drop constraint if exists pagamentos_tipo_check;
alter table pagamentos add constraint pagamentos_tipo_check check (tipo in ('pagamento','ajuste'));

-- ---------- Insumos: preço e categoria ------------------------------------
-- preço de referência: "preco" reais compram "preco_qtd" (na unidade de consumo)
--   ex.: renda R$ 59,90 por 45 m (1 kg)  ->  R$ 1,3311 por metro
alter table insumos add column if not exists preco numeric(12,4);
alter table insumos add column if not exists preco_qtd numeric(12,4) not null default 1 check (preco_qtd > 0);
alter table insumos add column if not exists preco_atualizado_em date;
alter table insumos add column if not exists categoria text not null default 'M.P';
alter table insumos drop constraint if exists insumos_categoria_check;
alter table insumos add constraint insumos_categoria_check check (categoria in ('M.P','Acabamento','M.O'));

-- ---------- Parâmetros de preço -------------------------------------------
create table if not exists custos_fixos (
  id     uuid primary key default gen_random_uuid(),
  nome   text not null,
  valor  numeric(12,2) not null default 0,
  ordem  integer not null default 0
);

create table if not exists parametros (
  chave  text primary key,
  valor  numeric(14,4) not null
);

-- tabelas de preço: percentuais que incidem sobre o preço de venda
create table if not exists tabelas_preco (
  id               uuid primary key default gen_random_uuid(),
  nome             text not null unique,
  lucro            numeric(6,4) not null default 0,     -- 0.10 = 10%
  inclui_imposto   boolean not null default true,
  inclui_comissao  boolean not null default true,
  inclui_frete     boolean not null default true,
  ordem            integer not null default 0
);

alter table custos_fixos  enable row level security;
alter table parametros    enable row level security;
alter table tabelas_preco enable row level security;
do $$
declare t text;
begin
  foreach t in array array['custos_fixos','parametros','tabelas_preco'] loop
    execute format('drop policy if exists "logado_tudo" on %I', t);
    execute format('create policy "logado_tudo" on %I for all to authenticated using (true) with check (true)', t);
  end loop;
end $$;

notify pgrst, 'reload schema';

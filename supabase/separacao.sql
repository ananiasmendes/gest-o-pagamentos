-- =====================================================================
--  Pinho · SEPARAÇÃO DE PEDIDOS + ESTOQUE + BLING
--  Rode DEPOIS do precificacao.sql. Pode ser rodado mais de uma vez.
--
--  Ideia: o estoque da PRATELEIRA é o que foi contado, mais as peças que
--  chegam das oficinas (Entradas), menos o que foi para as sacolas dos
--  pedidos. O que está na sacola continua na fábrica, mas já tem dono.
-- =====================================================================

-- ---------- Conexão com o Bling (só o servidor lê e escreve) -------------
create table if not exists bling_config (
  id                 integer primary key default 1 check (id = 1),
  access_token       text,
  refresh_token      text,
  expira_em          timestamptz,
  conectado_em       timestamptz,
  oauth_state        text,
  oauth_state_em     timestamptz,
  situacoes          jsonb    not null default '[]',   -- situações de venda do Bling: [{id, nome, idHerdado}]
  situacoes_abertas  bigint[] not null default '{}',   -- pedidos nessas situações viram cards
  situacao_separado  bigint,                           -- para onde o pedido vai ao tocar em "Pedido pronto"
  ultima_sync        timestamptz,
  ultimo_erro        text
);
insert into bling_config (id) values (1) on conflict (id) do nothing;
-- sem política de acesso de propósito: os tokens do Bling nunca chegam ao navegador
alter table bling_config enable row level security;

-- ---------- Início do controle de estoque --------------------------------
-- Só as Entradas lançadas a partir deste momento somam no estoque.
create table if not exists estoque_config (
  id      integer primary key default 1 check (id = 1),
  inicio  timestamptz not null default now()
);
insert into estoque_config (id) values (1) on conflict (id) do nothing;

-- ---------- Código do Bling -> modelo e tamanho ---------------------------
create table if not exists sku_bling (
  sku        text primary key,
  modelo_id  uuid not null references modelos(id) on delete cascade,
  tamanho    text not null
);

-- ---------- Pedidos de venda vindos do Bling ------------------------------
create table if not exists pedidos (
  id                 bigint primary key,                -- id do pedido no Bling
  numero             bigint,
  cliente            text not null default '',
  data               date not null,
  situacao_id        bigint,
  situacao_anterior  bigint,                            -- para desfazer o "Pedido pronto"
  status             text not null default 'aberto' check (status in ('aberto','pronto','enviado','cancelado')),
  total              numeric(14,2),
  total_produtos     numeric(14,2),
  observacoes        text,
  pronto_em          timestamptz,
  bling_marcado      boolean not null default false,    -- o Bling já foi avisado de que está separado
  baixa_direta       boolean not null default false,    -- saiu sem passar pela tela de separação
  sincronizado_em    timestamptz not null default now(),
  created_at         timestamptz not null default now()
);
create index if not exists pedidos_status_idx on pedidos (status, data);

create table if not exists pedido_itens (
  id          bigint primary key,                       -- id do item no Bling
  pedido_id   bigint not null references pedidos(id) on delete cascade,
  sku         text,
  descricao   text not null default '',
  quantidade  integer not null check (quantidade >= 0),
  modelo_id   uuid references modelos(id) on delete set null,   -- nulo = item manual ("Diversos")
  tamanho     text,
  ordem       integer not null default 0
);
create index if not exists pedido_itens_pedido_idx on pedido_itens (pedido_id);

-- ---------- Sacola: peças já separadas para um pedido ---------------------
-- Cada linha tira peças da prateleira. Pedido cancelado apaga as linhas (as peças voltam).
create table if not exists sacola (
  id          uuid primary key default gen_random_uuid(),
  pedido_id   bigint not null references pedidos(id) on delete cascade,
  item_id     bigint not null references pedido_itens(id) on delete cascade,
  modelo_id   uuid not null references modelos(id) on delete restrict,
  tamanho     text not null,
  quantidade  integer not null check (quantidade > 0),
  updated_at  timestamptz not null default now(),
  unique (item_id, modelo_id, tamanho)
);
create index if not exists sacola_pedido_idx on sacola (pedido_id);

-- ---------- Contagens e ajustes de estoque --------------------------------
-- quantidade é a diferença aplicada (+ ou -). Uma contagem grava a diferença entre o contado e o calculado.
create table if not exists estoque_mov (
  id          uuid primary key default gen_random_uuid(),
  criado_em   timestamptz not null default now(),
  modelo_id   uuid not null references modelos(id) on delete restrict,
  tamanho     text not null,
  quantidade  integer not null check (quantidade <> 0),
  motivo      text not null default 'contagem' check (motivo in ('contagem','ajuste')),
  observacao  text
);
create index if not exists estoque_mov_modelo_idx on estoque_mov (modelo_id, tamanho);

-- ---------- Segurança: só usuários logados --------------------------------
alter table estoque_config enable row level security;
alter table sku_bling      enable row level security;
alter table pedidos        enable row level security;
alter table pedido_itens   enable row level security;
alter table sacola         enable row level security;
alter table estoque_mov    enable row level security;

do $$
declare t text;
begin
  foreach t in array array['estoque_config','sku_bling','pedidos','pedido_itens','sacola','estoque_mov'] loop
    execute format('drop policy if exists "logado_tudo" on %I', t);
    execute format('create policy "logado_tudo" on %I for all to authenticated using (true) with check (true)', t);
  end loop;
end $$;

-- ---------- Códigos do Bling (relatório de produtos de 07/10/2026) --------
-- código da variação = código do modelo + 0 (U), 1 (P), 2 (M), 3 (G) ou 4 (GG)
drop table if exists _sku;
create temp table _sku (sku text, codigo text, tamanho text);
insert into _sku values
  ('100201', '10020', 'P'),
  ('100202', '10020', 'M'),
  ('100203', '10020', 'G'),
  ('100204', '10020', 'GG'),
  ('70201', '7020', 'P'),
  ('70202', '7020', 'M'),
  ('70203', '7020', 'G'),
  ('70204', '7020', 'GG'),
  ('10400', '1040', 'U'),
  ('10401', '1040', 'P'),
  ('10402', '1040', 'M'),
  ('10403', '1040', 'G'),
  ('10404', '1040', 'GG'),
  ('70500', '7050', 'U'),
  ('70501', '7050', 'P'),
  ('70502', '7050', 'M'),
  ('70503', '7050', 'G'),
  ('70504', '7050', 'GG'),
  ('90201', '9020', 'P'),
  ('90202', '9020', 'M'),
  ('90203', '9020', 'G'),
  ('90204', '9020', 'GG'),
  ('90301', '9030', 'P'),
  ('90302', '9030', 'M'),
  ('90303', '9030', 'G'),
  ('90304', '9030', 'GG'),
  ('11601', '1160', 'P'),
  ('11602', '1160', 'M'),
  ('11603', '1160', 'G'),
  ('11604', '1160', 'GG'),
  ('10801', '1080', 'P'),
  ('10802', '1080', 'M'),
  ('10803', '1080', 'G'),
  ('10804', '1080', 'GG'),
  ('70701', '7070', 'P'),
  ('70702', '7070', 'M'),
  ('70703', '7070', 'G'),
  ('70704', '7070', 'GG'),
  ('20401', '2040', 'P'),
  ('20402', '2040', 'M'),
  ('20403', '2040', 'G'),
  ('20404', '2040', 'GG'),
  ('80901', '8090', 'P'),
  ('80902', '8090', 'M'),
  ('80903', '8090', 'G'),
  ('80904', '8090', 'GG'),
  ('70301', '7030', 'P'),
  ('70302', '7030', 'M'),
  ('70303', '7030', 'G'),
  ('70304', '7030', 'GG'),
  ('11101', '1110', 'P'),
  ('11102', '1110', 'M'),
  ('11103', '1110', 'G'),
  ('11104', '1110', 'GG'),
  ('90501', '9050', 'P'),
  ('90502', '9050', 'M'),
  ('90503', '9050', 'G'),
  ('90504', '9050', 'GG'),
  ('80601', '8060', 'P'),
  ('80602', '8060', 'M'),
  ('80603', '8060', 'G'),
  ('80604', '8060', 'GG'),
  ('11401', '1140', 'P'),
  ('11402', '1140', 'M'),
  ('11403', '1140', 'G'),
  ('11404', '1140', 'GG'),
  ('70601', '7060', 'P'),
  ('70602', '7060', 'M'),
  ('70603', '7060', 'G'),
  ('70604', '7060', 'GG'),
  ('80801', '8080', 'P'),
  ('80802', '8080', 'M'),
  ('80803', '8080', 'G'),
  ('80804', '8080', 'GG'),
  ('20800', '2080', 'U'),
  ('20801', '2080', 'P'),
  ('20802', '2080', 'M'),
  ('20803', '2080', 'G'),
  ('20804', '2080', 'GG'),
  ('11201', '1120', 'P'),
  ('11202', '1120', 'M'),
  ('11203', '1120', 'G'),
  ('11204', '1120', 'GG'),
  ('60801', '6080', 'P'),
  ('60802', '6080', 'M'),
  ('60803', '6080', 'G'),
  ('60804', '6080', 'GG'),
  ('60101', '6010', 'P'),
  ('60102', '6010', 'M'),
  ('60103', '6010', 'G'),
  ('60104', '6010', 'GG'),
  ('50801', '5080', 'P'),
  ('50802', '5080', 'M'),
  ('50803', '5080', 'G'),
  ('50804', '5080', 'GG'),
  ('20900', '2090', 'U'),
  ('20901', '2090', 'P'),
  ('20902', '2090', 'M'),
  ('20903', '2090', 'G'),
  ('20904', '2090', 'GG'),
  ('20201', '2020', 'P'),
  ('20202', '2020', 'M'),
  ('20203', '2020', 'G'),
  ('20204', '2020', 'GG'),
  ('10201', '1020', 'P'),
  ('10202', '1020', 'M'),
  ('10203', '1020', 'G'),
  ('10204', '1020', 'GG'),
  ('10901', '1090', 'P'),
  ('10902', '1090', 'M'),
  ('10903', '1090', 'G'),
  ('10904', '1090', 'GG'),
  ('10301', '1030', 'P'),
  ('10302', '1030', 'M'),
  ('10303', '1030', 'G'),
  ('10304', '1030', 'GG'),
  ('20100', '2010', 'U'),
  ('20101', '2010', 'P'),
  ('20102', '2010', 'M'),
  ('20103', '2010', 'G'),
  ('20104', '2010', 'GG'),
  ('90401', '9040', 'P'),
  ('90402', '9040', 'M'),
  ('90403', '9040', 'G'),
  ('90404', '9040', 'GG'),
  ('50601', '5060', 'P'),
  ('50602', '5060', 'M'),
  ('50603', '5060', 'G'),
  ('50604', '5060', 'GG'),
  ('60401', '6040', 'P'),
  ('60402', '6040', 'M'),
  ('60403', '6040', 'G'),
  ('60404', '6040', 'GG'),
  ('90901', '9090', 'P'),
  ('90902', '9090', 'M'),
  ('90903', '9090', 'G'),
  ('90904', '9090', 'GG'),
  ('10701', '1070', 'P'),
  ('10702', '1070', 'M'),
  ('10703', '1070', 'G'),
  ('10704', '1070', 'GG'),
  ('30901', '3090', 'P'),
  ('30902', '3090', 'M'),
  ('30903', '3090', 'G'),
  ('30904', '3090', 'GG'),
  ('10711', '1071', 'P'),
  ('10712', '1071', 'M'),
  ('10713', '1071', 'G'),
  ('10714', '1071', 'GG'),
  ('20700', '2070', 'U'),
  ('20701', '2070', 'P'),
  ('20702', '2070', 'M'),
  ('20703', '2070', 'G'),
  ('20704', '2070', 'GG'),
  ('60201', '6020', 'P'),
  ('60202', '6020', 'M'),
  ('60203', '6020', 'G'),
  ('60204', '6020', 'GG'),
  ('60301', '6030', 'P'),
  ('60302', '6030', 'M'),
  ('60303', '6030', 'G'),
  ('60304', '6030', 'GG'),
  ('90801', '9080', 'P'),
  ('90802', '9080', 'M'),
  ('90803', '9080', 'G'),
  ('90804', '9080', 'GG'),
  ('90701', '9070', 'P'),
  ('90702', '9070', 'M'),
  ('90703', '9070', 'G'),
  ('90704', '9070', 'GG'),
  ('90601', '9060', 'P'),
  ('90602', '9060', 'M'),
  ('90603', '9060', 'G'),
  ('90604', '9060', 'GG'),
  ('70101', '7010', 'P'),
  ('70102', '7010', 'M'),
  ('70103', '7010', 'G'),
  ('70104', '7010', 'GG'),
  ('50700', '5070', 'U'),
  ('50701', '5070', 'P'),
  ('50702', '5070', 'M'),
  ('50703', '5070', 'G'),
  ('50704', '5070', 'GG'),
  ('50101', '5010', 'P'),
  ('50102', '5010', 'M'),
  ('50103', '5010', 'G'),
  ('50104', '5010', 'GG'),
  ('50111', '5011', 'P'),
  ('50112', '5011', 'M'),
  ('50113', '5011', 'G'),
  ('50114', '5011', 'GG'),
  ('20501', '2050', 'P'),
  ('20502', '2050', 'M'),
  ('20503', '2050', 'G'),
  ('20504', '2050', 'GG'),
  ('11301', '1130', 'P'),
  ('11302', '1130', 'M'),
  ('11303', '1130', 'G'),
  ('11304', '1130', 'GG'),
  ('10601', '1060', 'P'),
  ('10602', '1060', 'M'),
  ('10603', '1060', 'G'),
  ('10604', '1060', 'GG'),
  ('11501', '1150', 'P'),
  ('11502', '1150', 'M'),
  ('11503', '1150', 'G'),
  ('11504', '1150', 'GG'),
  ('20600', '2060', 'U'),
  ('20601', '2060', 'P'),
  ('20602', '2060', 'M'),
  ('20603', '2060', 'G'),
  ('20604', '2060', 'GG'),
  ('70400', '7040', 'U'),
  ('70401', '7040', 'P'),
  ('70402', '7040', 'M'),
  ('70403', '7040', 'G'),
  ('70404', '7040', 'GG'),
  ('80701', '8070', 'P'),
  ('80702', '8070', 'M'),
  ('80703', '8070', 'G'),
  ('80704', '8070', 'GG'),
  ('20301', '2030', 'P'),
  ('20302', '2030', 'M'),
  ('20303', '2030', 'G'),
  ('20304', '2030', 'GG'),
  ('10501', '1050', 'P'),
  ('10502', '1050', 'M'),
  ('10503', '1050', 'G'),
  ('10504', '1050', 'GG'),
  ('100301', '10030', 'P'),
  ('100302', '10030', 'M'),
  ('100303', '10030', 'G'),
  ('100304', '10030', 'GG'),
  ('30401', '3040', 'P'),
  ('30402', '3040', 'M'),
  ('30403', '3040', 'G'),
  ('30404', '3040', 'GG'),
  ('30201', '3020', 'P'),
  ('30202', '3020', 'M'),
  ('30203', '3020', 'G'),
  ('30204', '3020', 'GG'),
  ('30101', '3010', 'P'),
  ('30102', '3010', 'M'),
  ('30103', '3010', 'G'),
  ('30104', '3010', 'GG');

insert into sku_bling (sku, modelo_id, tamanho)
select distinct on (v.sku) v.sku, m.id, v.tamanho
  from _sku v join modelos m on m.codigo = v.codigo
 order by v.sku, m.ativo desc, m.created_at
on conflict (sku) do update set modelo_id = excluded.modelo_id, tamanho = excluded.tamanho;

notify pgrst, 'reload schema';

-- Conferência: códigos de modelo do Bling que NÃO existem em Oficinas e modelos.
-- O resultado ideal é uma lista vazia. Se aparecer algum, preencha o código no cadastro do modelo.
select distinct v.codigo as codigo_do_bling_sem_modelo
  from _sku v
 where not exists (select 1 from modelos m where m.codigo = v.codigo)
 order by 1;

-- Remove as linhas repetidas criadas quando o seed.sql foi rodado mais de uma vez.
-- Só mexe nos lotes grandes gravados de uma vez pelo seed (lançamentos feitos no site ficam intactos)
-- e em cada grupo de linhas idênticas mantém a mais antiga.
begin;

with lotes as (
  select created_at from entradas group by created_at having count(*) > 50
), repetidas as (
  select id, row_number() over (
           partition by data, oficina_id, operacao, tipo, modelo_id, tamanho, quantidade, valor_unitario
           order by created_at, id) as n
    from entradas where created_at in (select created_at from lotes)
)
delete from entradas where id in (select id from repetidas where n > 1);

with lotes as (
  select created_at from pagamentos group by created_at having count(*) > 20
), repetidas as (
  select id, row_number() over (
           partition by data, oficina_id, valor, observacao
           order by created_at, id) as n
    from pagamentos where created_at in (select created_at from lotes)
)
delete from pagamentos where id in (select id from repetidas where n > 1);

commit;

-- Conferência: saldo de cada oficina depois da limpeza
select o.nome,
       (select count(*) from entradas e where e.oficina_id = o.id) as entradas,
       (select count(*) from pagamentos p where p.oficina_id = o.id) as pagamentos,
       round((select coalesce(sum(valor_total),0) from entradas e where e.oficina_id = o.id)
           - (select coalesce(sum(valor),0) from pagamentos p where p.oficina_id = o.id), 2) as saldo
  from oficinas o order by o.nome;

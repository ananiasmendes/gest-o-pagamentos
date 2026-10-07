# Oficinas: produção e pagamentos

Sistema para lançar as peças que chegam das oficinas, calcular quanto é devido a cada uma, registrar pagamentos e acompanhar os indicadores de produção. Funciona no celular e no computador e pode ser instalado na tela inicial do celular como um app.

Tecnologia: Next.js 14, TypeScript, Tailwind CSS e Supabase.

## O que tem em cada tela

**Painel.** Mostra o saldo de cada oficina: quanto está em aberto, desde quando, há quantos dias foi o último pagamento e o prazo médio de pagamento. Também traz os números do período (peças costuradas, valor produzido, valor pago, custo médio da costura por peça, peças cortadas, número de entregas e projeção do mês), a produção mensal, a divisão entre oficinas, o ranking de modelos, a grade de tamanhos e os números por tipo de peça.

**Lançar.** Registra uma entrega. Você escolhe a oficina e o modelo, digita as quantidades de P, M, G e GG lado a lado e adiciona ao lote; o preço vem da tabela. O lote fica guardado no aparelho até ser salvo.

**Entradas.** Lista os lançamentos agrupados por dia, com filtros. Tocar numa linha abre a edição ou a exclusão. Também exporta para Excel.

**Pagamentos.** Registra, edita e exclui pagamentos. Tem um atalho "Quitar o saldo" e exporta para Excel.

**Extrato.** Mostra produção e pagamentos de uma oficina em ordem, com o saldo depois de cada movimento. O botão "Enviar no WhatsApp" monta o resumo pronto para mandar.

**Preços.** Tabela com o preço de costura por oficina e modelo, e o preço de corte por oficina e tipo. Cada mudança guarda a data de vigência e o histórico.

**Oficinas e modelos.** Cadastro, desativação e junção de modelos duplicados.

**Cortes.** Cria cada corte a partir do PDF do risco do Audaces (modelos, grade por folha e medidas são lidos sozinhos). Você escolhe a oficina de cada modelo, as cores e folhas, e quem corta. O sistema calcula as peças, o material para comprar (arredondado para a embalagem de cada insumo), as tags (3 por folha) e as etiquetas de composição (5 por folha), gera um PDF único de pedido de material e etiquetas com caixinhas para marcar, e o romaneio de cada oficina. Ao marcar o corte como cortado por um cortador parceiro, o pagamento do corte é lançado em Entradas. As entradas de costura vão abatendo o que falta voltar de cada corte.

**Ficha técnica.** Consumo de cada insumo por peça de cada modelo.

**Insumos e cores.** Como cada insumo é comprado (rolo de quantos metros, pacote de quantos pares, de meio em meio quilo…) e as cores de tecido.

**Precificação.** Custo de cada peça pela ficha técnica (matéria-prima, acabamento, corte e a maior costura paga entre as oficinas), custo fixo por peça, preço sugerido em cada tabela e o lucro que sobra no preço atual. Os custos fixos, os percentuais (imposto, comissão, frete), as tabelas e os preços da matéria-prima são editados na própria tela.

**Ajustes de saldo.** Em Pagamentos, um lançamento pode ser "Ajuste": acerta o saldo da oficina sem contar como dinheiro pago (não entra no total pago nem no prazo de pagamento).

**Importar.** Recebe entradas, pagamentos ou preços de um arquivo .xlsx ou .csv. Mostra uma prévia com erros e possíveis duplicatas antes de gravar e oferece uma planilha modelo para baixar.

### Regra de preço

A costura é paga por oficina e modelo. O corte é pago por oficina e tipo (calcinha, conjunto ou body), sem importar o modelo. Cada entrada guarda o valor do dia em que foi lançada, então mudar a tabela não altera o que já foi lançado. Na planilha antiga isso acontecia, porque as fórmulas recalculavam o histórico inteiro.

## Como colocar no ar

Todo o processo é feito pelo navegador, sem terminal.

### 1. Banco de dados (Supabase)

1. Crie um projeto em [supabase.com](https://supabase.com).
2. Abra **SQL Editor › New query**, cole todo o conteúdo de `supabase/schema.sql` e clique em **Run**.
3. Abra uma nova query, cole `supabase/seed.sql` e clique em **Run**. Isso carrega os dados da planilha: 1.097 entradas, 71 pagamentos, 59 modelos e os preços atuais.
4. Em **Authentication › Users › Add user**, crie o usuário:
   - e-mail: por exemplo `fabrica@seudominio.com`;
   - senha: o seu **PIN**, com 6 dígitos ou mais;
   - marque **Auto Confirm User**.
5. Em **Authentication › Sign In / Providers › Email**, desligue **Allow new users to sign up**. Assim ninguém cria conta por conta própria.
6. Em **Project Settings › API**, copie a **Project URL** e a chave **anon public**.

Para conferir se os dados entraram, rode esta consulta no SQL Editor:

```sql
select o.nome,
  (select sum(valor_total) from entradas e where e.oficina_id = o.id) as produzido,
  (select sum(valor) from pagamentos p where p.oficina_id = o.id) as pago
from oficinas o;
```

### 2. Código (GitHub)

1. Crie um repositório novo no GitHub.
2. Clique em **uploading an existing file** e arraste o **conteúdo** desta pasta (e não a pasta em si), mantendo as subpastas `src`, `public` e `supabase`.
3. Clique em **Commit changes**.

### 3. Publicação (Vercel)

1. Em [vercel.com](https://vercel.com), clique em **Add New › Project** e importe o repositório.
2. Em **Environment Variables**, cadastre:
   - `NEXT_PUBLIC_SUPABASE_URL`: a Project URL;
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`: a chave anon;
   - `NEXT_PUBLIC_LOGIN_EMAIL`: o e-mail do usuário criado no passo 1.4.
3. Clique em **Deploy**. Depois, cada alteração enviada ao GitHub publica sozinha.

### 4. Instalar no celular

Abra o link da Vercel no celular:

- No iPhone (Safari): **Compartilhar › Adicionar à Tela de Início**.
- No Android (Chrome): menu **⋮ › Instalar app**.

## Atualização: módulo de cortes

Para quem já está com o sistema no ar:

1. **Banco:** no Supabase, abra **SQL Editor › New query**, cole `supabase/cortes.sql` e clique em **Run**. Depois, numa nova query, cole `supabase/cortes_seed.sql` e rode. O primeiro cria as tabelas; o segundo carrega as 9 cores, os 32 insumos com as regras de compra e a ficha técnica dos 68 modelos da planilha. Os dois podem ser rodados de novo sem duplicar nada.
2. **Código:** no GitHub, abra o repositório, clique em **Add file › Upload files**, arraste de novo **todo o conteúdo** desta pasta e clique em **Commit changes**. Os arquivos com o mesmo nome são substituídos.
3. A Vercel publica sozinha em 1 a 3 minutos.

Se o site abrir a aba Cortes com o aviso "Falta criar as tabelas de cortes no banco", é porque o passo 1 ainda não foi feito.

## Atualização: precificação e fichas 2026

1. No Supabase (SQL Editor › New query), rode `supabase/precificacao.sql` e depois `supabase/precificacao_seed.sql`. O seed traz da planilha "Fichas de composição 2026" os preços da matéria-prima, as fichas técnicas atuais, os preços de venda, os custos fixos e percentuais, os preços de costura do Fabiano e o ajuste de R$ 96,60 do Antônio. Pode rodar de novo sem duplicar.
2. No GitHub, **Add file › Upload files**, arraste o conteúdo do zip da atualização e faça o commit. A Vercel publica sozinha.

## Atualização: separação de pedidos, estoque e Bling

Três telas novas, na área **Pedidos**:

**Separação.** Um card para cada pedido de venda em aberto no Bling. Cada item mostra quanto já está na sacola, quanto dá para pegar na prateleira agora (botão "Pegar") e quanto ainda falta produzir. O pedido mais antigo tem prioridade sobre o estoque. Com a sacola completa aparece o botão "Pedido pronto", que muda a situação do pedido no Bling para "Separado". Itens "Diversos" (saldo) pedem que se escolha quais peças entraram.

**Estoque.** Por modelo e tamanho: o que está livre para vender, o que está em sacola e o que os pedidos em aberto esperam. O botão "Contar" corrige a quantidade da prateleira.

**Integração Bling.** Conexão, endereços para o aplicativo e escolha das situações.

### Como o estoque é calculado

Prateleira = contagens + Entradas de costura lançadas depois que o `separacao.sql` foi rodado − peças que foram para sacolas. Peça em sacola continua na fábrica, mas já não conta como disponível. Pedido cancelado no Bling devolve as peças para a prateleira; pedido atendido dá baixa no que ainda não tinha sido marcado.

### Como colocar no ar

1. **Banco.** No Supabase, SQL Editor › New query, cole `supabase/separacao.sql` e clique em Run. O resultado final lista os códigos do Bling que não têm modelo no sistema; o esperado é uma lista vazia.
2. **Aplicativo no Bling.** Em Central de Extensões › Área do Integrador › Criar aplicativo, crie um aplicativo de uso próprio. Em **Link de redirecionamento**, cole o endereço mostrado na tela Integração Bling (termina em `/api/bling/callback`). Na lista de escopos, adicione os de Pedidos de Venda (leitura e alteração de situação). Depois de salvar, a aba Informações do app mostra o Client Id e o Client Secret.
3. **Vercel.** Em Settings › Environment Variables, cadastre e faça um novo deploy:
   - `BLING_CLIENT_ID` e `BLING_CLIENT_SECRET`: do aplicativo criado no passo 2;
   - `SUPABASE_SERVICE_ROLE_KEY`: em Supabase › Project Settings › API, a chave **service_role**. Ela dá acesso total ao banco: cadastre só na Vercel e nunca a coloque em arquivo do projeto.
4. **Conectar.** Na tela Integração Bling, toque em "Conectar ao Bling" e autorize.
5. **Situações.** No Bling, crie a situação "Separado" nos pedidos de venda. Na tela Integração Bling, toque em "Reler do Bling", marque as situações que viram cards (em aberto, em andamento) e escolha "Separado" como destino do "Pedido pronto".
6. **Contagem inicial.** Na tela Estoque, conte o que há na prateleira de cada modelo. O que já está em sacola entra pela tela de Separação.
7. **Webhook (opcional).** Na aba Webhooks do aplicativo no Bling, cadastre o endereço que termina em `/api/bling/webhook` para o recurso Pedido de Venda. Com ele o pedido novo aparece em segundos; sem ele, os pedidos chegam ao abrir a tela de Separação e a cada 2 minutos.

## Segurança

Só quem sabe o PIN acessa o sistema. As tabelas têm Row Level Security: sem login, o banco não entrega nem aceita nada, mesmo que alguém descubra a chave anon, que é pública por natureza.

Para trocar o PIN, vá em **Supabase › Authentication › Users**, abra o usuário e use **Reset password**, ou edite a senha direto.

Para dar acesso a outra pessoa com um PIN próprio, crie outro usuário. Na tela de login, deixe `NEXT_PUBLIC_LOGIN_EMAIL` vazio para que ela peça o e-mail junto com o PIN.

## Estrutura

```
supabase/schema.sql    tabelas, regra de preço vigente, gatilho e segurança
supabase/seed.sql      dados vindos da planilha (nomes já padronizados)
supabase/cortes.sql    tabelas do módulo de cortes
supabase/cortes_seed.sql  cores, insumos e ficha técnica da planilha de corte
supabase/precificacao.sql       tabelas e colunas da precificação e dos ajustes
supabase/precificacao_seed.sql  dados da planilha de fichas de composição 2026
supabase/separacao.sql          tabelas de pedidos, sacola e estoque + códigos do Bling
supabase/limpar_duplicados.sql  remove linhas repetidas se o seed.sql for rodado mais de uma vez
src/app/               uma pasta por tela
src/components/        interface: casca do app, filtros, formulários
src/lib/kpis.ts        cálculo dos indicadores e do prazo médio de pagamento
src/lib/importer.ts    leitura, validação e gravação das importações
src/lib/precos.ts      busca do preço vigente em uma data
src/lib/cortes/        leitura do risco, cálculos do corte e PDFs
src/lib/precificacao.ts  custo por peça e preço de venda
src/lib/separacao.ts     estoque da prateleira e distribuição entre os pedidos
src/lib/servidor/bling.ts  conversa com o Bling (só roda no servidor)
src/app/api/bling/       rotas do servidor: conexão, sincronização, pedido pronto e webhook
```

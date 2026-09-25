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

## Segurança

Só quem sabe o PIN acessa o sistema. As tabelas têm Row Level Security: sem login, o banco não entrega nem aceita nada, mesmo que alguém descubra a chave anon, que é pública por natureza.

Para trocar o PIN, vá em **Supabase › Authentication › Users**, abra o usuário e use **Reset password**, ou edite a senha direto.

Para dar acesso a outra pessoa com um PIN próprio, crie outro usuário. Na tela de login, deixe `NEXT_PUBLIC_LOGIN_EMAIL` vazio para que ela peça o e-mail junto com o PIN.

## Estrutura

```
supabase/schema.sql    tabelas, regra de preço vigente, gatilho e segurança
supabase/seed.sql      dados vindos da planilha (nomes já padronizados)
src/app/               uma pasta por tela
src/components/        interface: casca do app, filtros, formulários
src/lib/kpis.ts        cálculo dos indicadores e do prazo médio de pagamento
src/lib/importer.ts    leitura, validação e gravação das importações
src/lib/precos.ts      busca do preço vigente em uma data
```

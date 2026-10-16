# Supabase Keeper

Painel leve para manter projetos Supabase Free ativos com requisições mínimas ao banco e acompanhar tudo em um único lugar.

## Arquitetura

O Keeper é independente dos GitHubs e das contas Supabase dos projetos monitorados.

```text
Vercel
├── Next.js (painel)
├── Cron 08:17 America/Fortaleza
└── Cron 20:17 America/Fortaleza
        │
        ▼
Neon Postgres
├── usuários do Keeper
├── sessões
├── projetos cadastrados
└── histórico de pings
        │
        ├── Supabase A (qualquer conta)
        ├── Supabase B (qualquer organização)
        └── Supabase C (GitHub/GitLab/sem repositório)
```

O antigo uso do `dashboard-v3` como banco central foi removido. O Keeper agora usa um PostgreSQL separado no Neon.

## O que esta versão faz

- cadastro de projetos Supabase de contas e organizações diferentes;
- login próprio do Keeper;
- Publishable Keys criptografadas em repouso com AES-256-GCM;
- teste manual de conexão;
- ativar/pausar o keep-alive por projeto;
- dois ciclos automáticos por dia;
- histórico de pings, HTTP, latência e erros;
- retenção automática de 90 dias para logs;
- nenhum envio de e-mail, Slack, push ou webhook de erro;
- um projeto com erro não interrompe os demais.

## Neon

Projeto vinculado:

```text
project-id: spring-flower-77969329
branch: production
```

A configuração de infraestrutura fica em `neon.ts`:

```ts
import { defineConfig } from "@neon/config/v1";

export default defineConfig({});
```

O schema do banco do Keeper está em:

```text
neon/schema.sql
```

O contexto local criado por `neon link` fica em `.neon` e não é versionado. A connection string fica em `.env.local`/variáveis de ambiente e também não é versionada.

## Variáveis de ambiente

Na Vercel, o Keeper precisa apenas de:

```text
DATABASE_URL=postgresql://...
KEEPER_ENCRYPTION_KEY=...
KEEPER_SIGNUP_CODE=...
CRON_SECRET=...
```

### DATABASE_URL

Use a connection string da branch `production` do projeto Neon. O backend acessa o Neon diretamente com `@neondatabase/serverless`.

### KEEPER_ENCRYPTION_KEY

Gere uma chave de 32 bytes:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Não altere esta chave depois de cadastrar projetos sem antes migrar as credenciais.

### KEEPER_SIGNUP_CODE

Código privado necessário para criar uma conta no Keeper.

### CRON_SECRET

Gere outro token aleatório:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

## Setup local com Neon CLI

```bash
npm i -g neon@latest
neon login
neon skills -y
neon mcp -y
neon link --project-id spring-flower-77969329 --branch production -y
neon config init
neon deploy
```

Depois de `neon config init`, mantenha o conteúdo de `neon.ts` deste repositório.

`neon link` também puxa as variáveis da branch, incluindo `DATABASE_URL`, para o ambiente local.

## Preparar o banco Neon

Execute uma única vez o conteúdo de `neon/schema.sql` na branch `production`. Ele cria:

```text
keeper_users
keeper_sessions
keeper_projects
keeper_ping_logs
```

Essas tabelas guardam apenas dados do próprio Keeper. Nenhum dado de negócio dos projetos Supabase monitorados é copiado para o Neon.

## Preparar cada Supabase monitorado

Em cada projeto cadastrado, execute uma única vez:

```text
supabase/target-setup.sql
```

A função criada é mínima:

```sql
create or replace function public.keeper_ping()
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select true;
$$;

revoke all on function public.keeper_ping() from public;
grant execute on function public.keeper_ping() to anon, authenticated;
```

O Keeper chama:

```text
POST /rest/v1/rpc/keeper_ping
```

A função não lê ou altera tabelas do projeto monitorado.

## Segurança

- a `DATABASE_URL` do Neon existe apenas no backend;
- Publishable Keys dos Supabases monitorados são criptografadas com AES-256-GCM;
- nenhuma chave descriptografada é enviada ao browser;
- URL cadastrada é restrita a `https://*.supabase.co`;
- tokens de sessão são aleatórios e apenas o SHA-256 do token é armazenado;
- senhas do Keeper usam `scrypt` com salt aleatório;
- o endpoint de ping dos Supabases usa `SECURITY INVOKER`;
- não são usadas senhas de banco, `service_role` ou Secret Keys dos Supabases monitorados.

## Modo silencioso

O Keeper não envia notificações de erro.

Se um projeto falhar, o erro é salvo em `keeper_ping_logs` e exibido apenas no painel. Os demais projetos continuam sendo processados.

## Desenvolvimento

```bash
npm install
npm run dev
```

Abra `http://localhost:3000`.


## Monitoramento seguro de sites Vercel (outubro de 2026)

Os dois domínios de produção foram verificados nos projetos Vercel da equipe:
- MAE APS: https://maeaps.vercel.app
- Gestário APS: https://gestarioaps.vercel.app (projeto Vercel `painelprenatal`)

O banco Neon guarda estes sites em `keeper_sites` e seus logs em `keeper_site_logs`.
A migração `neon/site-monitoring.sql` é idempotente e foi aplicada ao Neon.
Em um banco novo, basta executar `neon/schema.sql`, que também cria as tabelas de sites.

Cada verificação executa um GET HTTPS na raiz do domínio Vercel aprovado, com
`redirect: manual` e timeout de 8 segundos. Não envia cookies, chaves, dados
pessoais ou autenticação. Não acompanha redirecionamentos nem acessa páginas internas.
Permite apenas domínios literais `https://nome.vercel.app`, sem portas ou caminhos.

As respostas HTTP 2xx e 3xx são marcadas como `online`, 401/403 como `protected`
e outros erros como `error`. Essa métrica é a disponibilidade e latência da
**entrada HTTP pública**; não é uma medição de carregamento completo do navegador,
nem prova de que páginas protegidas ou bancos de dados estejam funcionando.

O painel separa bancos Supabase e sites Vercel, exibe última verificação,
média dos últimos 7 dias, disponibilidade observada e histórico por site.
O status `protected` nunca deve ser tratado automaticamente como site caído.
O cron original duas vezes por dia foi reaproveitado, com registros limitados
a 90 dias; há também um botão `Testar agora`.


### Rota de saúde rápida (2026-10-16)

Para `maeaps.vercel.app` e `gestarioaps.vercel.app`, a verificação não usa mais a página inicial (que redireciona para a autenticação).
O Keeper consulta apenas `GET /api/health/live`, com `redirect: manual` e timeout de 8 segundos.
A resposta é válida apenas se for HTTP 200, `Content-Type: application/json` e corpo `{ "status": "ok" }`.
Esta rota é pública e mínima, sem dependências do Supabase, sem cookies, sem dados de saúde e sem verificação de sessão. Nos dois softwares, apenas esta rota exata dispensa a chamada de claims no proxy. Todas as demais rotas mantêm suas proteções originais.

O objetivo é medir somente a capacidade da aplicação de responder HTTP. O ping do banco Supabase continua um teste separado. Outros sites Vercel eventualmente cadastrados mantêm o comportamento legado de verificar a raiz; não são automaticamente considerados compatíveis com `/api/health/live`.

O histórico anterior de verificações da raiz continua salvo e compõe a média dos últimos sete dias; compare os novos tempos por código HTTP e após acumular novas amostras.

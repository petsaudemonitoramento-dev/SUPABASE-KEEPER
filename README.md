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

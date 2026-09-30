# Supabase Keeper

Painel leve para manter projetos Supabase Free ativos com requisições mínimas ao banco e acompanhar tudo em um único lugar.

## O que esta versão faz

- cadastro de projetos Supabase de contas e organizações diferentes;
- não depende do GitHub onde o projeto original está hospedado;
- login próprio do Keeper, separado do Auth dos outros sistemas;
- Publishable Keys criptografadas em repouso com AES-256-GCM;
- teste manual de conexão;
- ativar/pausar o keep-alive por projeto;
- dois ciclos automáticos por dia;
- histórico de pings, HTTP, latência e erros;
- retenção automática de 90 dias para logs;
- nenhum envio de e-mail, Slack, push ou webhook de erro;
- um projeto com erro não interrompe os demais.

O Supabase considera projetos Free com pouca atividade candidatos a pausa. A documentação atual informa que algumas requisições de usuário ao banco por dia normalmente são suficientes, mas não publica um limite exato garantido.

## Arquitetura

```text
Vercel
├── Next.js (painel)
├── Cron 08:17 America/Fortaleza
└── Cron 20:17 America/Fortaleza
        │
        ▼
Supabase central do Keeper
        │
        ├── projetos cadastrados
        ├── credenciais criptografadas
        └── histórico
        │
        ├── Supabase A (qualquer conta)
        ├── Supabase B (qualquer organização)
        └── Supabase C (sem relação com o GitHub do Keeper)
```

Os horários do `vercel.json` estão em UTC: 11:17 e 23:17, equivalentes a 08:17 e 20:17 em America/Fortaleza.

## Banco central já preparado

Nesta instalação, o control plane já foi criado no projeto Supabase `dashboard-v3`.

O schema reproduzível está em:

```text
supabase/migrations/20260930160000_create_keeper_schema.sql
```

As tabelas do Keeper não são acessíveis por `anon` ou `authenticated`. O acesso ocorre somente pelo backend com uma Secret Key do projeto central.

## Deploy na Vercel

Importe este repositório na Vercel e configure estas variáveis:

```text
SUPABASE_URL=https://nyexakdyxtstcyycmlng.supabase.co
SUPABASE_SECRET_KEY=sb_secret_...
KEEPER_ENCRYPTION_KEY=...
KEEPER_SIGNUP_CODE=...
CRON_SECRET=...
```

### SUPABASE_SECRET_KEY

No projeto `dashboard-v3`:

```text
Supabase Dashboard
→ Settings
→ API Keys
→ Secret key
```

Use uma Secret Key moderna (`sb_secret_...`) e nunca coloque esse valor no GitHub.

### KEEPER_ENCRYPTION_KEY

Gere localmente:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Não troque esta chave depois de cadastrar projetos sem antes migrar as credenciais; ela é usada para descriptografar as Publishable Keys salvas.

### KEEPER_SIGNUP_CODE

Defina uma frase ou token longo. Para criar uma conta no Keeper, o usuário precisa informar esse código.

Depois de criar sua conta, você pode trocar o valor na Vercel para bloquear cadastros com o código antigo.

### CRON_SECRET

Gere outro token aleatório, por exemplo:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

A Vercel usa `CRON_SECRET` para autenticar as chamadas dos Cron Jobs.

## Preparar cada Supabase monitorado

Em cada projeto que será cadastrado, execute uma única vez o conteúdo de:

```text
supabase/target-setup.sql
```

SQL:

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

O ping chama:

```text
POST /rest/v1/rpc/keeper_ping
```

Essa função não lê tabela, não insere nada e não altera dados. O trabalho no PostgreSQL é essencialmente:

```sql
select true;
```

## Credencial do projeto monitorado

Cadastre somente:

- nome;
- Project URL;
- Publishable Key (`sb_publishable_...`) ou `anon` legada.

Não use:

- senha do banco;
- Access Token da conta;
- `service_role`;
- Secret Key (`sb_secret_...`).

## Modo silencioso

O Keeper não possui integração de e-mail.

Falhas individuais são persistidas em `keeper_ping_logs` e o ciclo continua. A rota de cron retorna sucesso ao scheduler mesmo quando um projeto monitorado falha, evitando transformar uma indisponibilidade de destino em uma sequência de alertas externos.

## Segurança

- backend central usa Secret Key somente no servidor;
- nenhuma Secret Key vai para o browser;
- chaves dos projetos monitorados são criptografadas com AES-256-GCM;
- URL cadastrada é restrita a `https://*.supabase.co`, reduzindo risco de SSRF;
- sessões são tokens aleatórios; no banco é armazenado apenas o SHA-256 do token;
- senhas do Keeper são derivadas com `scrypt` e salt aleatório;
- as tabelas do Keeper possuem RLS e acesso direto revogado;
- a função de destino usa `SECURITY INVOKER`.

## Desenvolvimento local

Crie `.env.local` a partir de `.env.example`, depois:

```bash
npm install
npm run dev
```

Abra `http://localhost:3000`.

## Observação sobre o Supabase Free

O Supabase não fornece uma promessa de que exatamente duas consultas por dia impedirão pausa em todos os casos. O Keeper usa dois ciclos diários porque é um volume muito pequeno e coerente com a orientação de gerar atividade regular no banco. Se a política do Supabase mudar, a frequência pode ser ajustada no `vercel.json`.

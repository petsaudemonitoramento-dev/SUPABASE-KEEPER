import fs from "node:fs/promises";
import pg from "pg";

const { Client } = pg;
const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL não encontrada. Rode neon link/env pull antes.");
}

const schema = await fs.readFile(new URL("../neon/schema.sql", import.meta.url), "utf8");

const client = new Client({
  connectionString: databaseUrl
});

await client.connect();

try {
  await client.query(schema);

  const result = await client.query(`
    select table_name
    from information_schema.tables
    where table_schema = 'public'
      and table_name in (
        'keeper_users',
        'keeper_sessions',
        'keeper_projects',
        'keeper_ping_logs',
        'keeper_sites',
        'keeper_site_logs',
        'keeper_site_rounds'
      )
    order by table_name
  `);

  const names = result.rows.map((row) => row.table_name);

  if (names.length !== 7) {
    throw new Error(`Schema incompleto: foram encontradas ${names.length} de 7 tabelas.`);
  }

  console.log("Neon Keeper schema OK:", names.join(", "));
} finally {
  await client.end();
}

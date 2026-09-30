import fs from "node:fs/promises";
import { Client } from "@neondatabase/serverless";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL não encontrada. Rode neon link/env pull antes.");
}

const schema = await fs.readFile(new URL("../neon/schema.sql", import.meta.url), "utf8");
const client = new Client(databaseUrl);

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
        'keeper_ping_logs'
      )
    order by table_name
  `);

  const names = result.rows.map((row) => row.table_name);

  if (names.length !== 4) {
    throw new Error(`Schema incompleto: foram encontradas ${names.length} de 4 tabelas.`);
  }

  console.log("Neon Keeper schema OK:", names.join(", "));
} finally {
  await client.end();
}

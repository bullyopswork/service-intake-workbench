import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import nextEnv from "@next/env";
import { Pool } from "pg";

nextEnv.loadEnvConfig(process.cwd());
const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required");
const pool = new Pool({ connectionString, max: 1 });
try {
  const sql = await readFile(resolve("db/001_init.sql"), "utf8");
  await pool.query(sql);
  process.stdout.write("Workbench migration 001 applied.\n");
} finally {
  await pool.end();
}

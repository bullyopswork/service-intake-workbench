import { Pool, type PoolClient } from "pg";

declare global {
  // Reuse one pool across Next development reloads.
  var workbenchPool: Pool | undefined;
}

export function pool(): Pool {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not configured");
  if (!globalThis.workbenchPool) {
    globalThis.workbenchPool = new Pool({
      connectionString,
      max: 8,
      idleTimeoutMillis: 20_000,
      connectionTimeoutMillis: 5_000,
    });
  }
  return globalThis.workbenchPool;
}

export async function transaction<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool().connect();
  try {
    await client.query("BEGIN");
    const result = await work(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

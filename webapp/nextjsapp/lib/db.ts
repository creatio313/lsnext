import mysql, { type Pool, type RowDataPacket } from "mysql2/promise";

let pool: Pool | null = null;

function getDatabaseUrl(): string {
  const databaseUrl = process.env.DATABASE_URL;
  if (databaseUrl) {
    return databaseUrl;
  }

  const host = process.env.DB_HOST;
  const port = process.env.DB_PORT ?? "3306";
  const user = process.env.DB_USER;
  const password = process.env.DB_PASSWORD;
  const database = process.env.DB_NAME;

  if (!host || !user || !database) {
    throw new Error(
      "データベースの設定が不足しています。DATABASE_URL または DB_HOST/DB_USER/DB_NAME を設定してください。",
    );
  }

  const encodedPassword = encodeURIComponent(password ?? "");
  return `mysql://${user}:${encodedPassword}@${host}:${port}/${database}`;
}

export function getDbPool(): Pool {
  if (!pool) {
    pool = mysql.createPool({
      uri: getDatabaseUrl(),
      connectionLimit: 10,
      namedPlaceholders: true,
      timezone: "+09:00",
    });
  }

  return pool;
}

export type DbRow = RowDataPacket;

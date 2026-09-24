import type { RowDataPacket } from "mysql2";
import { getDbPool } from "@/lib/db";

type UserEmailRow = RowDataPacket & {
  email: string;
};

export async function getUserEmailById(
  userId: number,
  fallbackEmail = "",
): Promise<string> {
  const pool = getDbPool();
  const [users] = await pool.execute<UserEmailRow[]>(
    "SELECT email FROM users WHERE id = ? LIMIT 1",
    [userId],
  );

  return users[0]?.email ?? fallbackEmail;
}

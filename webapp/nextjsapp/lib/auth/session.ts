import { NextRequest } from "next/server";
import type { RowDataPacket } from "mysql2";
import { AUTH_COOKIE_NAME, verifyAuthToken } from "@/lib/auth/jwt";
import { getDbPool } from "@/lib/db";

export type AuthSession = {
  userId: number;
  loginId: string;
  email: string;
  role: "admin" | "user";
  displayName: string;
};

export async function getAuthSession(
  request: NextRequest,
): Promise<AuthSession | null> {
  const token = request.cookies.get(AUTH_COOKIE_NAME)?.value;
  if (!token) {
    return null;
  }

  try {
    const payload = await verifyAuthToken(token);
    const userId = Number.parseInt(payload.sub, 10);

    if (!Number.isInteger(userId) || userId <= 0) {
      return null;
    }

    const pool = getDbPool();
    const [users] = await pool.execute<Array<RowDataPacket & {
      login_id: string;
      email: string;
      role: "admin" | "user";
      display_name: string;
    }>>(
      "SELECT login_id, email, role, display_name FROM users WHERE id = ? LIMIT 1",
      [userId],
    );
    const user = users[0];

    if (!user || user.role !== payload.role) {
      return null;
    }

    return {
      userId,
      loginId: user.login_id,
      email: user.email,
      role: user.role,
      displayName: user.display_name,
    };
  } catch {
    return null;
  }
}

import bcrypt from "bcryptjs";
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { randomInt } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth/session";
import { getDbPool } from "@/lib/db";

export const runtime = "nodejs";

type UserRole = "admin" | "user";

type UserSummaryRow = RowDataPacket & {
  id: number;
  login_id: string;
  display_name: string;
  email: string;
  role: UserRole;
  is_passkey_enabled: number;
  created_at: string;
  updated_at: string;
};

const PASSWORD_CHARSETS = {
  lower: "abcdefghijkmnopqrstuvwxyz",
  upper: "ABCDEFGHJKLMNPQRSTUVWXYZ",
  digits: "23456789",
  symbols: "!@#$%^&*()-_=+",
};

function pickRandom(text: string) {
  return text[randomInt(text.length)];
}

function shuffle(text: string) {
  const chars = [...text];
  for (let i = chars.length - 1; i > 0; i -= 1) {
    const j = randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
}

function generatePassword(length = 16) {
  const all =
    PASSWORD_CHARSETS.lower +
    PASSWORD_CHARSETS.upper +
    PASSWORD_CHARSETS.digits +
    PASSWORD_CHARSETS.symbols;

  const required = [
    pickRandom(PASSWORD_CHARSETS.lower),
    pickRandom(PASSWORD_CHARSETS.upper),
    pickRandom(PASSWORD_CHARSETS.digits),
    pickRandom(PASSWORD_CHARSETS.symbols),
  ];

  const restLength = Math.max(length - required.length, 0);
  let rest = "";
  for (let i = 0; i < restLength; i += 1) {
    rest += pickRandom(all);
  }

  return shuffle(required.join("") + rest);
}

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export async function GET(request: NextRequest) {
  try {
    const session = await getAuthSession(request);
    if (!session) {
      return NextResponse.json({ error: "未認証です。" }, { status: 401 });
    }

    if (session.role !== "admin") {
      return NextResponse.json(
        { error: "管理者のみ利用者一覧を参照できます。" },
        { status: 403 },
      );
    }

    const pool = getDbPool();
    const [users] = await pool.execute<UserSummaryRow[]>(
      "SELECT id, login_id, display_name, email, role, is_passkey_enabled, created_at, updated_at FROM users ORDER BY id ASC",
    );

    return NextResponse.json({
      users: users.map((user) => ({
        id: user.id,
        loginId: user.login_id,
        displayName: user.display_name,
        email: user.email,
        role: user.role,
        isPasskeyEnabled: Boolean(user.is_passkey_enabled),
        createdAt: user.created_at,
        updatedAt: user.updated_at,
        isCurrentUser: user.id === session.userId,
      })),
    });
  } catch (error) {
    console.error("利用者一覧取得失敗", error);
    return NextResponse.json(
      { error: "利用者一覧の取得に失敗しました。" },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getAuthSession(request);
    if (!session) {
      return NextResponse.json({ error: "未認証です。" }, { status: 401 });
    }

    if (session.role !== "admin") {
      return NextResponse.json(
        { error: "管理者のみ利用者を追加できます。" },
        { status: 403 },
      );
    }

    const body = (await request.json()) as {
      loginId?: string;
      displayName?: string;
      email?: string;
      role?: UserRole;
    };

    const loginId = body.loginId?.trim() ?? "";
    const displayName = body.displayName?.trim() ?? "";
    const email = body.email?.trim() ?? "";
    const role = body.role ?? "user";

    if (!loginId || !displayName || !email) {
      return NextResponse.json(
        { error: "ログインID・表示名・メールアドレスは必須です。" },
        { status: 400 },
      );
    }

    if (!/^[a-zA-Z0-9._-]{3,64}$/.test(loginId)) {
      return NextResponse.json(
        {
          error: "ログインIDは3〜64文字の英数字と . _ - のみ使用できます。",
        },
        { status: 400 },
      );
    }

    if (!isValidEmail(email)) {
      return NextResponse.json(
        { error: "メールアドレスの形式が正しくありません。" },
        { status: 400 },
      );
    }

    if (role !== "admin" && role !== "user") {
      return NextResponse.json(
        { error: "ロールは admin または user を指定してください。" },
        { status: 400 },
      );
    }

    const generatedPassword = generatePassword();
    const passwordHash = await bcrypt.hash(generatedPassword, 12);

    const pool = getDbPool();
    const [result] = await pool.execute<ResultSetHeader>(
      "INSERT INTO users (login_id, display_name, email, role, password_hash, is_passkey_enabled, created_by) VALUES (?, ?, ?, ?, ?, FALSE, ?)",
      [loginId, displayName, email, role, passwordHash, session.userId],
    );

    return NextResponse.json({
      created: true,
      user: {
        id: result.insertId,
        loginId,
        displayName,
        email,
        role,
      },
      generatedPassword,
    });
  } catch (error) {
    const mysqlError = error as { code?: string };
    if (mysqlError.code === "ER_DUP_ENTRY") {
      return NextResponse.json(
        {
          error:
            "ログインIDまたはメールアドレスが既に登録されています。別の値を指定してください。",
        },
        { status: 409 },
      );
    }

    console.error("利用者追加失敗", error);
    return NextResponse.json(
      { error: "利用者追加に失敗しました。" },
      { status: 500 },
    );
  }
}

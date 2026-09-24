import bcrypt from "bcryptjs";
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { randomInt } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth/session";
import { getDbPool } from "@/lib/db";

export const runtime = "nodejs";

const PASSWORD_CHARSETS = {
  lower: "abcdefghijkmnopqrstuvwxyz",
  upper: "ABCDEFGHJKLMNPQRSTUVWXYZ",
  digits: "23456789",
  symbols: "!@#$%^&*()-_=+",
};

type UserRoleRow = RowDataPacket & {
  role: "admin" | "user";
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

async function parseUserId(paramsPromise: Promise<{ userId: string }>) {
  const params = await paramsPromise;
  const userId = Number.parseInt(params.userId, 10);
  if (!Number.isInteger(userId) || userId <= 0) {
    return null;
  }

  return userId;
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ userId: string }> },
) {
  try {
    const session = await getAuthSession(request);
    if (!session) {
      return NextResponse.json({ error: "未認証です。" }, { status: 401 });
    }

    if (session.role !== "admin") {
      return NextResponse.json(
        { error: "管理者のみパスワードをリセットできます。" },
        { status: 403 },
      );
    }

    const userId = await parseUserId(context.params);
    if (!userId) {
      return NextResponse.json(
        { error: "不正な利用者IDです。" },
        { status: 400 },
      );
    }

    const pool = getDbPool();
    const [targetRows] = await pool.execute<UserRoleRow[]>(
      "SELECT role FROM users WHERE id = ? LIMIT 1",
      [userId],
    );

    if (targetRows.length === 0) {
      return NextResponse.json(
        { error: "対象の利用者が見つかりません。" },
        { status: 404 },
      );
    }

    const generatedPassword = generatePassword();
    const passwordHash = await bcrypt.hash(generatedPassword, 12);

    const [result] = await pool.execute<ResultSetHeader>(
      "UPDATE users SET password_hash = ? WHERE id = ?",
      [passwordHash, userId],
    );

    if (result.affectedRows === 0) {
      return NextResponse.json(
        { error: "対象の利用者が見つかりません。" },
        { status: 404 },
      );
    }

    return NextResponse.json({
      reset: true,
      generatedPassword,
    });
  } catch (error) {
    console.error("利用者パスワードリセット失敗", error);
    return NextResponse.json(
      { error: "利用者パスワードのリセットに失敗しました。" },
      { status: 500 },
    );
  }
}

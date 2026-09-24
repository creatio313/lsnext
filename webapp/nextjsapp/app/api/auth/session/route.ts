import { NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth/session";
import { getUserEmailById } from "@/lib/auth/user";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const session = await getAuthSession(request);
    if (!session) {
      return NextResponse.json({ authenticated: false }, { status: 401 });
    }

    const email = await getUserEmailById(session.userId, session.email);

    return NextResponse.json({
      authenticated: true,
      user: {
        id: session.userId,
        loginId: session.loginId,
        email,
        displayName: session.displayName,
        role: session.role,
      },
    });
  } catch (error) {
    console.error("セッション取得失敗", error);
    return NextResponse.json(
      { error: "セッション取得に失敗しました。" },
      { status: 500 },
    );
  }
}

import { NextResponse } from "next/server";
import { AUTH_COOKIE_NAME } from "@/lib/auth/jwt";
import { WEBAUTHN_CHALLENGE_COOKIE_NAME } from "@/lib/auth/webauthn";

export const runtime = "nodejs";

export async function POST() {
  const response = NextResponse.json({ ok: true });
  response.cookies.delete(AUTH_COOKIE_NAME);
  response.cookies.delete(WEBAUTHN_CHALLENGE_COOKIE_NAME);
  return response;
}

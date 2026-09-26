import "server-only";

import { createHash, randomBytes } from "node:crypto";
import type { NextRequest, NextResponse } from "next/server";

const COOKIE_NAME = "choiceproof_owner";

export type OwnerIdentity = {
  token: string;
  hash: string;
  isNew: boolean;
};

export function getOwnerIdentity(request: NextRequest): OwnerIdentity {
  const existing = request.cookies.get(COOKIE_NAME)?.value;
  const token = existing && existing.length >= 32 ? existing : randomBytes(32).toString("base64url");
  return {
    token,
    hash: createHash("sha256").update(token).digest("hex"),
    isNew: !existing,
  };
}

export function attachOwnerCookie(response: NextResponse, owner: OwnerIdentity) {
  if (owner.isNew) {
    response.cookies.set(COOKIE_NAME, owner.token, {
      httpOnly: true,
      sameSite: "strict",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
    });
  }
  return response;
}

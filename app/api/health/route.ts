import { NextResponse } from "next/server";
import { checkPersistenceHealth } from "@/lib/db";
import { isJevConfigured } from "@/lib/jev";
import { isServConfigured } from "@/lib/serv";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const database = await checkPersistenceHealth();
  return NextResponse.json({
    ok: database.status !== "failed",
    services: {
      serv: { configured: isServConfigured() },
      database,
      jev: { configured: isJevConfigured() },
    },
  }, { status: database.status === "failed" ? 503 : 200, headers: { "Cache-Control": "no-store" } });
}

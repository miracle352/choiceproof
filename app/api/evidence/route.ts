import { NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { listPublishedResults } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const evidence = await listPublishedResults();
    return NextResponse.json(
      { ok: true, evidence, count: evidence.length },
      { headers: { "Cache-Control": "public, max-age=0, s-maxage=60, stale-while-revalidate=300" } },
    );
  } catch (error) {
    return apiError(error);
  }
}

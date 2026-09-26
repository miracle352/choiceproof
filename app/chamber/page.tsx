import { connection } from "next/server";
import { SiteHeader } from "@/components/site-header";
import { Workbench } from "@/components/workbench";
import { isJevConfigured } from "@/lib/jev";
import { isServConfigured } from "@/lib/serv";

export default async function ChamberPage() {
  await connection();
  return <><SiteHeader /><Workbench servConfigured={isServConfigured()} databaseConfigured={Boolean(process.env.DATABASE_URL?.trim())} jevConfigured={isJevConfigured()} /></>;
}

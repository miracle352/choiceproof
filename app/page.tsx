import { Workbench } from "@/components/workbench";
import { isServConfigured } from "@/lib/serv";
import { isJevConfigured } from "@/lib/jev";
import { connection } from "next/server";

export default async function Home() {
  await connection();
  const servConfigured = isServConfigured();
  const databaseConfigured = Boolean(process.env.DATABASE_URL?.trim());

  return <Workbench servConfigured={servConfigured} databaseConfigured={databaseConfigured} jevConfigured={isJevConfigured()} />;
}

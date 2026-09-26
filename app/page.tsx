import { Workbench } from "@/components/workbench";
import { isServConfigured } from "@/lib/serv";
import { connection } from "next/server";

export default async function Home() {
  await connection();
  const liveConfigured = isServConfigured();
  const persistenceConfigured = Boolean(process.env.DATABASE_URL?.trim());

  return <Workbench liveConfigured={liveConfigured} persistenceConfigured={persistenceConfigured} />;
}

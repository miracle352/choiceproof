import { Workbench } from "@/components/workbench";
import { connection } from "next/server";

export default async function Home() {
  await connection();
  const liveConfigured = Boolean(process.env.SERV_API_KEY?.trim());

  return <Workbench liveConfigured={liveConfigured} />;
}

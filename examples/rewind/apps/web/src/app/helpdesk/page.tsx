import { notFound, redirect } from "next/navigation";
import { getPageSession } from "@/lib/auth";
import { flags } from "@/lib/flags";
import { HelpdeskPage } from "./helpdesk";

export default async function Helpdesk() {
  if (!flags.HELPDESK) notFound();
  const session = await getPageSession();
  if (!session) redirect("/login");

  return <HelpdeskPage />;
}

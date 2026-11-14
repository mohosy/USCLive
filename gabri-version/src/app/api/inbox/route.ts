import { connection } from "next/server";
import { db } from "@/lib/store";


export async function GET() {
  await connection();
  const d = db();
  return Response.json({ items: d.inbox.map((i) => ({ ...i, scanned: d.scannedInbox.includes(i.id) })) });
}

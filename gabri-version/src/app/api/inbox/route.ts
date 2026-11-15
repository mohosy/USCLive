import { connection } from "next/server";
import { db } from "@/lib/store";
import { withState } from "@/lib/state";


async function GET_() {
  await connection();
  const d = db();
  return Response.json({ items: d.inbox.map((i) => ({ ...i, scanned: d.scannedInbox.includes(i.id) })) });
}

export const GET = withState(GET_);

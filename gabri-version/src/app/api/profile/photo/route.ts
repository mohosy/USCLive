import { connection } from "next/server";
import { getMe } from "@/lib/store";
import { withState } from "@/lib/state";

/** Your profile photo as a normal image. The URL carries a version, so the browser caches it until it changes. */
async function GET_() {
  await connection();
  const m = getMe().photo?.match(/^data:(image\/(?:jpeg|png|webp));base64,(.+)$/);
  if (!m) return new Response(null, { status: 404 });
  return new Response(Buffer.from(m[2], "base64"), {
    headers: { "Content-Type": m[1], "Cache-Control": "private, max-age=31536000, immutable" },
  });
}

export const GET = withState(GET_);

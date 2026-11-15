import { connection } from "next/server";
import { getMe } from "@/lib/store";

/** Your profile photo as a normal image. The URL carries a version, so the browser caches it until it changes. */
export async function GET() {
  await connection();
  const m = getMe().photo?.match(/^data:(image\/(?:jpeg|png|webp));base64,(.+)$/);
  if (!m) return new Response(null, { status: 404 });
  return new Response(Buffer.from(m[2], "base64"), {
    headers: { "Content-Type": m[1], "Cache-Control": "private, max-age=31536000, immutable" },
  });
}

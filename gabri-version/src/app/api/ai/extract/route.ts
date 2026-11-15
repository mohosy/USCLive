import { z } from "zod";
import { extractEvent, ruleModeration } from "@/lib/ai";
import { body } from "@/lib/http";
import { withState } from "@/lib/state";

const Input = z.object({
  text: z.string().max(8000).optional(),
  image: z.object({ data: z.string().max(7_000_000), mediaType: z.enum(["image/png", "image/jpeg", "image/webp", "image/gif"]) }).optional(),
}).refine((v) => v.text || v.image, "Provide text or an image");

async function POST_(req: Request) {
  const parsed = await body(req, Input);
  if (!parsed.ok) return parsed.res;
  const res = await extractEvent(parsed.data);
  // quick pre-check so the UI can warn before submit (full moderation runs on create)
  const precheck = ruleModeration(`${res.data.title}\n${res.data.description}\n${parsed.data.text ?? ""}`);
  return Response.json({ draft: res.data, ai: res.ai, error: res.error, precheck });
}

export const POST = withState(POST_);

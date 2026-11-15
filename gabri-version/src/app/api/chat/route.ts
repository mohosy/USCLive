import { z } from "zod";
import { chat } from "@/lib/agent";
import { body } from "@/lib/http";

const Input = z.object({
  messages: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(2000), eventIds: z.array(z.string().max(40)).max(10).optional() })).min(1).max(30),
  lat: z.number(),
  lng: z.number(),
});

/** One chat turn with the campus assistant: a reply, plus actions for the map (walk, open, focus) and event cards. */
export async function POST(req: Request) {
  const parsed = await body(req, Input);
  if (!parsed.ok) return parsed.res;
  const { messages, lat, lng } = parsed.data;
  return Response.json(await chat(messages, { lat, lng }));
}

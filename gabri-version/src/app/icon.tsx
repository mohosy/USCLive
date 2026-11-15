import { favIcon } from "@/lib/appIcon";

// browser-tab favicon (replaces the default Next.js favicon.ico)
export const size = { width: 64, height: 64 };
export const contentType = "image/png";

export default async function Icon() {
  return favIcon(64);
}

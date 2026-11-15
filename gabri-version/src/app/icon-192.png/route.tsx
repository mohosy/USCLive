import { appIcon } from "@/lib/appIcon";

/** Home-screen / install icon (Android and the web manifest). */
export async function GET() {
  return appIcon(192);
}

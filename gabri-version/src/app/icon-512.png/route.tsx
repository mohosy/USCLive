import { appIcon } from "@/lib/appIcon";

/** Large install icon (splash screens, app switchers). */
export async function GET() {
  return appIcon(512);
}

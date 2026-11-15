import { appIcon } from "@/lib/appIcon";

/** Large install icon (splash screens, app switchers). */
export function GET() {
  return appIcon(512);
}

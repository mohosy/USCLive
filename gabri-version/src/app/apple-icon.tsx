import { appIcon } from "@/lib/appIcon";

// iPhone home-screen icon (Add to Home Screen)
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default async function AppleIcon() {
  return appIcon(180);
}

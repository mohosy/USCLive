import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  // short on purpose: it's the name under the home-screen icon and in browser tabs
  title: "USCLive",
  description: "A live 3D map of everything happening at USC, with an AI assistant that tells you what to do now.",
  // installed on an iPhone home screen: full-screen, its own name, the map runs under the status bar
  appleWebApp: { capable: true, title: "USCLive", statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1, // the map handles pinch-zoom; the page itself shouldn't zoom
  viewportFit: "cover", // use the whole screen; content is kept clear of the notch with safe-area insets
  themeColor: "#990000",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="h-full overflow-hidden">{children}</body>
    </html>
  );
}

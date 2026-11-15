import Link from "next/link";
import { PHOTO_CREDITS } from "@/lib/eventPhotos";

export const metadata = { title: "Photo credits · USCLive" };

/** Attribution for the freely licensed event photos shown on the map (Creative Commons / public domain). */
export default function Credits() {
  return (
    <main className="mx-auto max-w-2xl px-5 py-10">
      <Link href="/" className="text-sm text-muted hover:text-foreground">← Map</Link>
      <h1 className="mt-3 text-2xl font-semibold tracking-tight">Photo credits</h1>
      <p className="mt-1 text-sm text-muted">Event photos on the map are from Wikimedia Commons, used under their licenses.</p>
      <ul className="mt-6 divide-y divide-line rounded-2xl border border-line bg-white">
        {Object.entries(PHOTO_CREDITS).map(([key, c]) => (
          <li key={key} className="flex items-center gap-4 p-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`/img/events/${key}.jpg`} alt="" className="h-12 w-20 shrink-0 rounded-lg object-cover" />
            <div className="min-w-0 text-sm">
              <a href={c.source} target="_blank" rel="noopener noreferrer" className="block truncate font-medium hover:underline">{c.title}</a>
              <div className="truncate text-muted">{c.author} · {c.license}</div>
            </div>
          </li>
        ))}
      </ul>
    </main>
  );
}

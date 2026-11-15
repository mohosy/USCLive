import Link from "next/link";
import { PHOTO_CREDITS } from "@/lib/eventPhotos";

export const metadata = { title: "About, credits and privacy · USCLive" };

const H2 = ({ children }: { children: React.ReactNode }) => <h2 className="mt-8 text-lg font-semibold tracking-tight">{children}</h2>;
const P = ({ children }: { children: React.ReactNode }) => <p className="mt-2 text-sm leading-relaxed text-foreground/80">{children}</p>;

/** What USCLive is, where its maps and data come from, what it stores about you, and the photo credits. */
export default function Credits() {
  return (
    <main className="mx-auto max-w-2xl px-5 py-10">
      <Link href="/" className="text-sm text-muted hover:text-foreground">← Map</Link>
      <h1 className="mt-3 text-2xl font-semibold tracking-tight">About, credits and privacy</h1>

      <H2>About</H2>
      <P>USCLive is a student project built for the HackSC hackathon. It is not an official USC service and is not endorsed by the University of Southern California or by any organization named in it.</P>
      <P>The events, the people, the headcounts and the live game scores you see are demo data. The student organizations are real USC organizations, shown with their public names and descriptions; they are not hosting the demo events. Dining menus, opening hours, the athletics schedule, library study rooms, weather and public safety reports come from the public sources listed below.</P>
      <P>USCLive never registers you on Handshake or Engage and never books a room: it opens the official page.</P>

      <H2>Maps</H2>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-relaxed text-foreground/80">
        <li>Explore view: © <a className="underline" href="https://www.mapbox.com/about/maps/" target="_blank" rel="noopener noreferrer">Mapbox</a> and © <a className="underline" href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors. Building footprints and campus places are from OpenStreetMap.</li>
        <li>Satellite view: Photorealistic 3D Tiles and imagery © Google and its data providers, credited on the map.</li>
        <li>Walking routes: Mapbox Directions.</li>
      </ul>

      <H2>Data sources</H2>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-relaxed text-foreground/80">
        <li>Dining menus and hours: USC Hospitality (hospitality.usc.edu).</li>
        <li>Athletics schedule: USC Athletics (usctrojans.com). Scores, when real: ESPN.</li>
        <li>Study room availability: USC Libraries (libcal.usc.edu). School rooms are demo data.</li>
        <li>Public safety reports: USC Department of Public Safety daily crime and fire log.</li>
        <li>Weather: <a className="underline" href="https://open-meteo.com/" target="_blank" rel="noopener noreferrer">Open-Meteo</a>.</li>
        <li>Webcams: USC campus cameras and Caltrans traffic cameras, shown from their public feeds.</li>
        <li>Organization names, descriptions and logos: each organization&apos;s own site and USC&apos;s EngageSC directory.</li>
      </ul>

      <H2>Privacy</H2>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-relaxed text-foreground/80">
        <li>What is stored: your name, username, school, interests, profile settings, friends, and the events you register for. With Google sign-in, your Google email and name; your calendar is only read, never changed.</li>
        <li>Your location stays in your browser. It is sent only to work out walking times, and it is not saved.</li>
        <li>Sharing is opt-in: everything under Settings &gt; Privacy is off until you turn it on. Friends see the events you are going to only if you switch that on.</li>
        <li>Crowd levels are estimates for a whole building; places with fewer than five people are hidden.</li>
        <li>Leaving: Sign out removes your session from this browser. There is no self-service account deletion yet; to have your account and its data removed, ask the USCLive team.</li>
      </ul>

      <H2>Photo credits</H2>
      <P>Event photos on the map are from Wikimedia Commons, used under their licenses.</P>
      <ul className="mt-4 divide-y divide-line rounded-2xl border border-line bg-white">
        {Object.entries(PHOTO_CREDITS).map(([key, c]) => (
          <li key={key} className="flex items-center gap-4 p-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`/img/events/${key}.jpg`} alt="" loading="lazy" className="h-12 w-20 shrink-0 rounded-lg object-cover" />
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

/**
 * Public live cameras on and around campus (verified live on 2026-11-14).
 *
 * - Caltrans CCTV: open public data (cwwp2.dot.ca.gov), CORS allowed. Credit "Caltrans".
 *   Full District 7 list: https://cwwp2.dot.ca.gov/data/d7/cctv/cctvStatusD07.json
 * - USC Tommy Cam / Hecuba Cam: USC restricts its player to usc.edu, so we only show the public
 *   snapshot and link out to the official page for the live video.
 */
export interface Webcam {
  id: string;
  name: string;
  view: string; // what it looks at
  lat: number;
  lng: number;
  source: "Caltrans" | "USC";
  /** HLS stream we may play directly */
  hls?: string;
  /** still image, refreshed every ~30-60 s */
  image: string;
  /** official page, for cameras we can't stream directly */
  page?: string;
}

const CT = "https://cwwp2.dot.ca.gov/data/d7/cctv/image";

export const WEBCAMS: Webcam[] = [
  {
    id: "usc-tommy", name: "Tommy Trojan", view: "Hahn Plaza: Tommy Trojan, Bovard and Trousdale Parkway",
    lat: 34.020536, lng: -118.285465, source: "USC",
    image: "https://cdn.pixelcaster.com/public.pixelcaster.com/snapshots/usc-tommy/latest_1920x.jpg",
    page: "https://www.usc.edu/tommy-cam/",
  },
  {
    id: "usc-hecuba", name: "Hecuba, USC Village", view: "USC Village plaza, looking north",
    lat: 34.02482, lng: -118.28469, source: "USC",
    image: "https://cdn.pixelcaster.com/public.pixelcaster.com/snapshots/usc-hecuba/latest_1920x.jpg",
    page: "https://www.usc.edu/hecuba-cam/",
  },
  {
    id: "ct-178", name: "I-110 at Exposition (north)", view: "Harbor Freeway looking north toward downtown",
    lat: 34.0198, lng: -118.2794, source: "Caltrans",
    hls: "https://wzmedia.dot.ca.gov/D7/CCTV-178.stream/playlist.m3u8",
    image: `${CT}/i110178expositionblvd/i110178expositionblvd.jpg`,
  },
  {
    id: "ct-822", name: "I-110 at Exposition (south)", view: "Harbor Freeway looking south",
    lat: 34.017754, lng: -118.280744, source: "Caltrans",
    hls: "https://wzmedia.dot.ca.gov/D7/CCTV-822.stream/playlist.m3u8",
    image: `${CT}/i110822soexpositionblvd/i110822soexpositionblvd.jpg`,
  },
  {
    id: "ct-177", name: "I-110 at MLK Blvd", view: "Harbor Freeway by Exposition Park, looking south",
    lat: 34.009798, lng: -118.281435, source: "Caltrans",
    hls: "https://wzmedia.dot.ca.gov/D7/CCTV-177.stream/playlist.m3u8",
    image: `${CT}/i110177martinlutherkingblvd/i110177martinlutherkingblvd.jpg`,
  },
  {
    id: "ct-179", name: "I-110 at Adams Blvd", view: "Harbor Freeway at the northeast corner of campus",
    lat: 34.0272, lng: -118.2745, source: "Caltrans",
    image: `${CT}/i110179adamsblvd/i110179adamsblvd.jpg`,
  },
];

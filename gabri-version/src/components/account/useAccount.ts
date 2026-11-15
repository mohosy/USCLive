"use client";

import { useCallback, useEffect, useState } from "react";
import { api, type EventView } from "@/lib/client-types";
import type { SchoolId, UserPrefs } from "@/lib/types";
import { loadSession, signIn } from "../SignIn";

export interface ProfileView {
  id: string;
  name: string;
  username: string;
  avatar: string;
  photo: string | null;
  pronouns: string;
  bio: string;
  email: string;
  school: SchoolId;
  major: string;
  year: string;
  verified: boolean;
  interests: string[];
  accountType: "student" | "creator";
  creatorOrgId: string | null;
  creatorOrgName: string | null;
  friendsCount: number;
  /** clubs and orgs you belong to */
  clubs: { id: string; name: string; logo?: string }[];
  /** Settings (your Trojan's look, privacy, notifications, map) */
  prefs: UserPrefs;
}
export interface ProfileData {
  profile: ProfileView;
  upcoming: EventView[];
  past: EventView[];
  hosting: EventView[];
  /** events you are going to in the next 7 days */
  goingThisWeek: number;
  /** your friends, each with what you share ("2 classes, 1 event together"; empty when nothing) */
  friends: { id: string; name: string; avatar: string; photo?: string; username: string; shared: string }[];
}

/**
 * Restores the saved sign-in (the demo server forgets it on restart), then loads the profile.
 * status: "loading" → "ready" | "signedout" | "error".
 */
export function useAccount() {
  const [data, setData] = useState<ProfileData | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "signedout" | "error">("loading");

  const reload = useCallback(async () => {
    setData(await api<ProfileData>("/api/profile"));
  }, []);

  useEffect(() => {
    const saved = loadSession();
    const t = setTimeout(async () => {
      if (!saved) return setStatus("signedout");
      try {
        await signIn(saved);
        await reload();
        setStatus("ready");
      } catch {
        setStatus("error");
      }
    }, 0);
    return () => clearTimeout(t);
  }, [reload]);

  return { data, setData, status, reload };
}

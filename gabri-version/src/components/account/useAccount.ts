"use client";

import { useCallback, useEffect, useState } from "react";
import { api, type EventView } from "@/lib/client-types";
import type { SchoolId } from "@/lib/types";
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
}
export interface ProfileData {
  profile: ProfileView;
  upcoming: EventView[];
  past: EventView[];
  hosting: EventView[];
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

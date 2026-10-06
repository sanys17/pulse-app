import { useState, useEffect, useCallback, useRef } from "react";

export interface CalendarEvent {
  id: string;
  summary: string;
  start: { dateTime?: string; date?: string };
  end: { dateTime?: string; date?: string };
}

interface UseGoogleCalendarReturn {
  events: CalendarEvent[];
  loading: boolean;
  connected: boolean;
  available: boolean;
  connect: () => void;
  disconnect: () => void;
}

declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initTokenClient: (config: {
            client_id: string;
            scope: string;
            callback: (resp: { access_token?: string; error?: string }) => void;
          }) => { requestAccessToken: (opts?: { prompt?: string }) => void };
        };
      };
    };
  }
}

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;
const SCOPES = "https://www.googleapis.com/auth/calendar.readonly";
const STORAGE_KEY = "pulse-gcal-token";

function loadScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.google?.accounts?.oauth2) { resolve(); return; }
    const s = document.createElement("script");
    s.src = "https://accounts.google.com/gsi/client";
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("Failed to load Google Identity Services"));
    document.head.appendChild(s);
  });
}

export function useGoogleCalendar(): UseGoogleCalendarReturn {
  const [token, setToken] = useState<string | null>(() => {
    try { return localStorage.getItem(STORAGE_KEY); } catch { return null; }
  });
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const clientRef = useRef<{ requestAccessToken: (opts?: { prompt?: string }) => void } | null>(null);

  const fetchEvents = useCallback(async (accessToken: string) => {
    setLoading(true);
    try {
      const now = new Date().toISOString();
      const params = new URLSearchParams({
        timeMin: now,
        maxResults: "2",
        singleEvents: "true",
        orderBy: "startTime",
      });
      const res = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`,
        { headers: { Authorization: `Bearer ${accessToken}` } },
      );
      if (res.status === 401) {
        setToken(null);
        setEvents([]);
        try { localStorage.removeItem(STORAGE_KEY); } catch {}
        return;
      }
      if (!res.ok) return;
      const data = await res.json();
      setEvents((data.items as CalendarEvent[]) || []);
    } catch {
      // network error — keep stale events
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (token) fetchEvents(token);
  }, [token, fetchEvents]);

  // re-fetch every 5 min while connected
  useEffect(() => {
    if (!token) return;
    const id = setInterval(() => fetchEvents(token), 5 * 60 * 1000);
    return () => clearInterval(id);
  }, [token, fetchEvents]);

  const connect = useCallback(async () => {
    if (!CLIENT_ID) return;
    try {
      await loadScript();
    } catch { return; }
    if (!window.google) return;

    if (!clientRef.current) {
      clientRef.current = window.google.accounts.oauth2.initTokenClient({
        client_id: CLIENT_ID,
        scope: SCOPES,
        callback: (resp) => {
          if (resp.access_token) {
            setToken(resp.access_token);
            try { localStorage.setItem(STORAGE_KEY, resp.access_token); } catch {}
          }
        },
      });
    }
    clientRef.current.requestAccessToken();
  }, []);

  const disconnect = useCallback(() => {
    setToken(null);
    setEvents([]);
    clientRef.current = null;
    try { localStorage.removeItem(STORAGE_KEY); } catch {}
  }, []);

  return {
    events,
    loading,
    connected: !!token,
    available: !!CLIENT_ID,
    connect,
    disconnect,
  };
}

export function formatRelativeTime(dateStr: string): string {
  const now = Date.now();
  const t = new Date(dateStr).getTime();
  const diff = t - now;
  if (diff < 0) return "now";
  const min = Math.round(diff / 60_000);
  if (min < 60) return `in ${min} min`;
  const hrs = Math.round(min / 60);
  if (hrs < 24) return `in ${hrs} h`;
  if (hrs < 48) return "tomorrow";
  return new Date(dateStr).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

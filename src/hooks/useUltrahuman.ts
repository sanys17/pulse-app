import { useState, useEffect, useCallback, useRef } from "react";

export interface VitalsData {
  hr: { avg: number; min: number; max: number } | null;
  hrv: { avg: number } | null;
  sleep: {
    totalMinutes: number;
    score: number;
    efficiency: number;
    deepMinutes: number;
    remMinutes: number;
  } | null;
  steps: { total: number } | null;
  recovery: { score: number } | null;
  spo2: { avg: number } | null;
  movement: { score: number } | null;
}

interface UltrahumanMetric {
  type: string;
  object: Record<string, unknown>;
}

const CACHE_KEY = "pulse-vitals-cache";

function loadCache(): { date: string; vitals: VitalsData } | null {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveCache(date: string, vitals: VitalsData) {
  try {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify({ date, vitals }));
  } catch {}
}

function parseMetrics(metrics: UltrahumanMetric[]): VitalsData {
  const result: VitalsData = {
    hr: null,
    hrv: null,
    sleep: null,
    steps: null,
    recovery: null,
    spo2: null,
    movement: null,
  };

  for (const m of metrics) {
    const obj = m.object;
    switch (m.type) {
      case "hr": {
        const values = (obj.values as { value: number }[]) ?? [];
        if (values.length > 0) {
          const nums = values.map((v) => v.value);
          result.hr = {
            avg: Math.round(nums.reduce((a, b) => a + b, 0) / nums.length),
            min: Math.min(...nums),
            max: Math.max(...nums),
          };
        }
        break;
      }
      case "hrv": {
        const avg = obj.avg as number | undefined;
        if (avg !== undefined) {
          result.hrv = { avg: Math.round(avg) };
        }
        break;
      }
      case "sleep": {
        const sleepScore = obj.sleep_score as { score: number } | undefined;
        const totalSleep = obj.total_sleep as { minutes: number } | undefined;
        const sleepEff = obj.sleep_efficiency as { percentage: number } | undefined;
        const deep = obj.deep_sleep as { minutes: number } | undefined;
        const rem = obj.rem_sleep as { minutes: number } | undefined;

        if (totalSleep) {
          result.sleep = {
            totalMinutes: totalSleep.minutes,
            score: sleepScore?.score ?? 0,
            efficiency: sleepEff?.percentage ?? 0,
            deepMinutes: deep?.minutes ?? 0,
            remMinutes: rem?.minutes ?? 0,
          };
        }
        break;
      }
      case "steps": {
        const total = obj.total as number | undefined;
        if (total !== undefined) {
          result.steps = { total };
        }
        break;
      }
      case "recovery_index": {
        const value = obj.value as number | undefined;
        if (value !== undefined) {
          result.recovery = { score: value };
        }
        break;
      }
      case "movement_index": {
        const value = obj.value as number | undefined;
        if (value !== undefined) {
          result.movement = { score: value };
        }
        break;
      }
      case "spo2": {
        const avg = obj.avg as number | undefined;
        if (avg !== undefined && avg > 1) {
          result.spo2 = { avg: Math.round(avg) };
        }
        break;
      }
    }
  }

  return result;
}

function toDateKey(d: Date = new Date()): string {
  return d.toISOString().slice(0, 10);
}

export function useUltrahuman() {
  const [vitals, setVitals] = useState<VitalsData | null>(() => {
    const cached = loadCache();
    const today = toDateKey();
    return cached?.date === today ? cached.vitals : null;
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const lastFetchedDate = useRef<string | null>(null);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchVitals = useCallback(async (date?: string, isRetry = false) => {
    const dateStr = date ?? toDateKey();

    if (!isRetry) {
      setLoading(true);
    }
    setError(null);

    try {
      const res = await fetch(`/api/ultrahuman?date=${dateStr}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }

      const json = await res.json();
      const dateMetrics = json?.data?.metrics?.[dateStr];

      if (!dateMetrics || !Array.isArray(dateMetrics)) {
        if (!isRetry) {
          setError("No data for this date");
        }
      } else {
        const parsed = parseMetrics(dateMetrics);
        setVitals(parsed);
        saveCache(dateStr, parsed);
        lastFetchedDate.current = dateStr;
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to fetch vitals";
      setError(msg);

      if (!isRetry) {
        retryTimer.current = setTimeout(() => {
          fetchVitals(dateStr, true);
        }, 5000);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchVitals();

    const handleVisibility = () => {
      if (document.visibilityState !== "visible") return;

      const today = toDateKey();
      if (lastFetchedDate.current !== today) {
        fetchVitals(today);
        return;
      }

      fetchVitals(today);
    };

    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      if (retryTimer.current) clearTimeout(retryTimer.current);
    };
  }, [fetchVitals]);

  return { vitals, loading, error, refetch: fetchVitals };
}

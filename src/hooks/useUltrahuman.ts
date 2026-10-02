import { useState, useEffect, useCallback } from "react";

export interface VitalsData {
  hr: { avg: number; min: number; max: number } | null;
  hrv: { avg: number } | null;
  sleep: {
    duration: number;
    score: number;
    efficiency: number;
  } | null;
  steps: { total: number } | null;
  recovery: { score: number } | null;
  temperature: { deviation: number } | null;
  spo2: { avg: number } | null;
}

interface UltrahumanMetric {
  type: string;
  object: {
    title?: string;
    values?: { value: number; timestamp: number }[];
    avg?: number;
    min?: number;
    max?: number;
    total?: number;
    score?: number;
    duration?: number;
    efficiency?: number;
    deviation?: number;
    [key: string]: unknown;
  };
}

function parseMetrics(metrics: UltrahumanMetric[]): VitalsData {
  const result: VitalsData = {
    hr: null,
    hrv: null,
    sleep: null,
    steps: null,
    recovery: null,
    temperature: null,
    spo2: null,
  };

  for (const m of metrics) {
    const obj = m.object;
    switch (m.type) {
      case "hr": {
        const values = obj.values ?? [];
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
        const values = obj.values ?? [];
        if (values.length > 0) {
          const nums = values.map((v) => v.value);
          result.hrv = {
            avg: Math.round(nums.reduce((a, b) => a + b, 0) / nums.length),
          };
        }
        break;
      }
      case "sleep":
      case "sleep_data": {
        if (obj.duration || obj.score) {
          result.sleep = {
            duration: (obj.duration as number) ?? 0,
            score: (obj.score as number) ?? 0,
            efficiency: (obj.efficiency as number) ?? 0,
          };
        }
        break;
      }
      case "steps": {
        const values = obj.values ?? [];
        if (values.length > 0) {
          result.steps = {
            total: values.reduce((sum, v) => sum + v.value, 0),
          };
        } else if (obj.total) {
          result.steps = { total: obj.total as number };
        }
        break;
      }
      case "recovery":
      case "recovery_score": {
        if (obj.score !== undefined) {
          result.recovery = { score: obj.score as number };
        }
        break;
      }
      case "temperature":
      case "skin_temperature": {
        if (obj.deviation !== undefined) {
          result.temperature = { deviation: obj.deviation as number };
        }
        const values = obj.values ?? [];
        if (!result.temperature && values.length > 0) {
          const nums = values.map((v) => v.value);
          const avg = nums.reduce((a, b) => a + b, 0) / nums.length;
          result.temperature = { deviation: Math.round((avg - 36.5) * 10) / 10 };
        }
        break;
      }
      case "spo2": {
        const values = obj.values ?? [];
        if (values.length > 0) {
          const nums = values.map((v) => v.value).filter((v) => v > 0);
          if (nums.length > 0) {
            result.spo2 = {
              avg: Math.round(nums.reduce((a, b) => a + b, 0) / nums.length),
            };
          }
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
  const [vitals, setVitals] = useState<VitalsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchVitals = useCallback(async (date?: string) => {
    const dateStr = date ?? toDateKey();
    setLoading(true);
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
        setVitals(null);
        setError("No data for this date");
      } else {
        setVitals(parseMetrics(dateMetrics));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to fetch vitals");
      setVitals(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchVitals();
  }, [fetchVitals]);

  return { vitals, loading, error, refetch: fetchVitals };
}

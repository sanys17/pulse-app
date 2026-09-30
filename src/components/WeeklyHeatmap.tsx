import { Fragment } from "react";

interface WeeklyHeatmapProps {
  data: { date: string; completed: boolean }[][];
  color: string;
}

const DAY_LABELS = ["S", "M", "T", "W", "T", "F", "S"];

export function WeeklyHeatmap({ data, color }: WeeklyHeatmapProps) {
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "20px repeat(7, 1fr)",
          gap: 3,
          alignItems: "center",
        }}
      >
        <div />
        {DAY_LABELS.map((label, i) => (
          <span
            key={i}
            style={{
              fontSize: 10,
              fontWeight: 500,
              color: "var(--color-text-secondary)",
              textAlign: "center",
              lineHeight: 1,
            }}
          >
            {label}
          </span>
        ))}

        {data.map((week, wi) => (
          <Fragment key={wi}>
            <span
              style={{
                fontSize: 10,
                color: "var(--color-text-secondary)",
                textAlign: "right",
                paddingRight: 4,
                lineHeight: 1,
              }}
            >
              {wi === data.length - 1 ? "Now" : `${data.length - 1 - wi}w`}
            </span>
            {week.map((day) => {
              const isToday = day.date === today;
              const isFuture = day.date > today;

              return (
                <div
                  key={day.date}
                  aria-label={`${day.date}: ${day.completed ? "completed" : "not completed"}`}
                  style={{
                    aspectRatio: "1",
                    borderRadius: 3,
                    background: isFuture
                      ? "transparent"
                      : day.completed
                      ? color
                      : "var(--color-surface-dim)",
                    opacity: isFuture ? 0.2 : day.completed ? 0.85 : 1,
                    border: isToday
                      ? "1.5px solid var(--color-text-secondary)"
                      : "1px solid transparent",
                    transition: "background 200ms ease, opacity 200ms ease",
                  }}
                />
              );
            })}
          </Fragment>
        ))}
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "var(--space-3)",
          justifyContent: "flex-end",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <div
            style={{
              width: 8,
              height: 8,
              borderRadius: 2,
              background: "var(--color-surface-dim)",
            }}
          />
          <span style={{ fontSize: 10, color: "var(--color-text-secondary)" }}>
            Not done
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <div
            style={{
              width: 8,
              height: 8,
              borderRadius: 2,
              background: color,
              opacity: 0.85,
            }}
          />
          <span style={{ fontSize: 10, color: "var(--color-text-secondary)" }}>
            Done
          </span>
        </div>
      </div>
    </div>
  );
}

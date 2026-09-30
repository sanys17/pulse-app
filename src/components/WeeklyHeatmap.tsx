interface WeeklyHeatmapProps {
  data: { date: string; completed: boolean }[][];
  color: string;
}

const DAY_LABELS = ["S", "M", "T", "W", "T", "F", "S"];

function getHeatLevel(weekData: { date: string; completed: boolean }[][]): Map<string, number> {
  const map = new Map<string, number>();
  const allDates = weekData.flat();

  for (const d of allDates) {
    map.set(d.date, d.completed ? 1 : 0);
  }

  return map;
}

export function WeeklyHeatmap({ data, color }: WeeklyHeatmapProps) {
  const today = new Date().toISOString().slice(0, 10);
  const levels = getHeatLevel(data);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
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
          <>
            <span
              key={`label-${wi}`}
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
              const level = levels.get(day.date) ?? 0;
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
                      : level > 0
                      ? color
                      : "var(--color-surface-dim)",
                    opacity: isFuture ? 0.2 : level > 0 ? 0.85 : 1,
                    border: isToday
                      ? "1.5px solid var(--color-text-secondary)"
                      : "1px solid transparent",
                    transition: "background 200ms ease, opacity 200ms ease",
                  }}
                />
              );
            })}
          </>
        ))}
      </div>
    </div>
  );
}

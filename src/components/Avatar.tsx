interface AvatarProps {
  name: string;
  src?: string | null;
  size?: number;
  ring?: string;
}

export function Avatar({ name, src, size = 40, ring }: AvatarProps) {
  return (
    <div
      aria-hidden="true"
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        background: "var(--color-surface-dim)",
        overflow: "hidden",
        flexShrink: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: Math.round(size * 0.42),
        fontWeight: 700,
        color: "var(--color-accent)",
        boxShadow: ring ? `0 0 0 2px ${ring}` : undefined,
      }}
    >
      {src ? (
        <img src={src} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      ) : (
        (name.trim().charAt(0) || "?").toUpperCase()
      )}
    </div>
  );
}

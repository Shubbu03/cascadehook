const particles = [
  [7, 24, 2, -3],
  [16, 38, 3, -11],
  [24, 18, 2, -7],
  [9, 57, 2, -14],
  [20, 72, 2, -5],
  [29, 86, 3, -9],
  [6, 88, 2, -1],
  [27, 49, 2, -12],
  [75, 22, 2, -8],
  [87, 16, 3, -4],
  [94, 37, 2, -13],
  [79, 51, 2, -6],
  [91, 66, 3, -10],
  [76, 78, 2, -2],
  [86, 88, 2, -15],
  [96, 91, 2, -7],
] as const;

export function AmbientBackground() {
  return (
    <div className="ambient-background" aria-hidden="true">
      <span className="ambient-background-texture" />
      {particles.map(([x, y, size, delay]) => (
        <span
          key={x + "-" + y}
          className="ambient-background-particle"
          style={{
            left: x + "%",
            top: y + "%",
            width: size,
            height: size,
            animationDelay: delay + "s",
          }}
        />
      ))}
      <span className="ambient-background-corner" data-corner="top-left" />
      <span className="ambient-background-corner" data-corner="top-right" />
      <span className="ambient-background-corner" data-corner="bottom-left" />
      <span className="ambient-background-corner" data-corner="bottom-right" />
    </div>
  );
}

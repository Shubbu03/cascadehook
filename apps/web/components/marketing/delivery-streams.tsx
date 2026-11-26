const width = 1200;
const drop = 18;
const radius = 9;

// A horizontal line that steps down at each x, with rounded corners, like the bars in the logo.
function stepLine(startY: number, steps: number[]) {
  let y = startY;
  let d = `M0 ${y}`;
  for (const x of steps) {
    d += ` H${x - radius} Q${x} ${y} ${x} ${y + radius} V${y + drop - radius} Q${x} ${y + drop} ${x + radius} ${y + drop}`;
    y += drop;
  }
  return `${d} H${width}`;
}

const lines = [
  { d: stepLine(14, [330, 780]), packets: [{ dur: 11, begin: 0 }, { dur: 11, begin: 5.5 }] },
  { d: stepLine(40, [190, 650, 1020]), packets: [{ dur: 14, begin: 2 }], retry: { dur: 16, begin: 6 } },
  { d: stepLine(66, [460, 920]), packets: [{ dur: 9, begin: 1 }, { dur: 9, begin: 4 }, { dur: 9, begin: 7 }] },
];

// Packets pause partway, as a delivery waits for its retry, then continue as a success.
const retryPoints = { keyPoints: "0;0.42;0.42;1", keyTimes: "0;0.3;0.62;1" };

export function DeliveryStreams() {
  return (
    <svg viewBox={`0 0 ${width} 112`} className="block h-auto w-full" aria-hidden="true" focusable="false">
      {lines.map((line, index) => (
        <g key={index}>
          <path d={line.d} fill="none" strokeWidth={1} className="stroke-border" />
          {line.packets.map((packet) => (
            <circle key={packet.begin} r={2.6} className="fill-accent motion-reduce:hidden" opacity={0}>
              <animateMotion dur={`${packet.dur}s`} begin={`${packet.begin}s`} repeatCount="indefinite" path={line.d} />
              <animate attributeName="opacity" dur={`${packet.dur}s`} begin={`${packet.begin}s`} repeatCount="indefinite" values="0;1;1;0" keyTimes="0;0.04;0.94;1" />
            </circle>
          ))}
          {line.retry && (
            <>
              <circle r={3} className="fill-danger motion-reduce:hidden" opacity={0}>
                <animateMotion dur={`${line.retry.dur}s`} begin={`${line.retry.begin}s`} repeatCount="indefinite" path={line.d} calcMode="linear" {...retryPoints} />
                <animate attributeName="opacity" dur={`${line.retry.dur}s`} begin={`${line.retry.begin}s`} repeatCount="indefinite" values="0;1;1;0.35;1;0;0" keyTimes="0;0.03;0.3;0.46;0.6;0.62;1" />
              </circle>
              <circle r={3} className="fill-success motion-reduce:hidden" opacity={0}>
                <animateMotion dur={`${line.retry.dur}s`} begin={`${line.retry.begin}s`} repeatCount="indefinite" path={line.d} calcMode="linear" {...retryPoints} />
                <animate attributeName="opacity" dur={`${line.retry.dur}s`} begin={`${line.retry.begin}s`} repeatCount="indefinite" values="0;0;1;1;0" keyTimes="0;0.61;0.63;0.96;1" />
              </circle>
            </>
          )}
        </g>
      ))}
    </svg>
  );
}

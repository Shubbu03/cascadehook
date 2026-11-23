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
    <div className={"[--edge-inset:clamp(1.25rem,4vw,4rem)] absolute z-0 overflow-hidden pointer-events-none text-accent inset-0 before:absolute before:bg-[radial-gradient(ellipse_at_0%_28%,color-mix(in_srgb,currentColor_10%,transparent),transparent_48%),radial-gradient(ellipse_at_100%_88%,color-mix(in_srgb,currentColor_9%,transparent),transparent_45%)] before:content-[''] before:inset-0 forced-colors:hidden"} aria-hidden="true">
      <span className="absolute bg-[radial-gradient(currentColor_0.7px,transparent_1px)] bg-size-[26px_26px] mask-[radial-gradient(ellipse_at_0%_28%,#000,transparent_58%),radial-gradient(ellipse_at_100%_88%,#000,transparent_52%)] opacity-26 inset-0 max-[37.5rem]:opacity-20" />
      {particles.map(([x, y, size, delay]) => (
        <span
          key={x + "-" + y}
          className="absolute rounded-full bg-current [box-shadow:0_0_8px_color-mix(in_srgb,currentColor_45%,transparent)] opacity-45 animate-ambient-drift motion-reduce:animate-none max-[37.5rem]:nth-of-type-[even]:hidden"
          style={{
            left: x + "%",
            top: y + "%",
            width: size,
            height: size,
            animationDelay: delay + "s",
          }}
        />
      ))}
      <span className={"absolute border-t border-r-0 border-b-0 border-l opacity-40 size-12 border-solid border-current data-[corner=\"top-left\"]:top-[calc(var(--edge-inset)+4rem)] data-[corner=\"top-left\"]:left-(--edge-inset) data-[corner=\"top-right\"]:top-[calc(var(--edge-inset)+4rem)] data-[corner=\"top-right\"]:right-(--edge-inset) data-[corner=\"top-right\"]:rotate-90 data-[corner=\"bottom-left\"]:bottom-(--edge-inset) data-[corner=\"bottom-left\"]:left-(--edge-inset) data-[corner=\"bottom-left\"]:-rotate-90 data-[corner=\"bottom-right\"]:right-(--edge-inset) data-[corner=\"bottom-right\"]:bottom-(--edge-inset) data-[corner=\"bottom-right\"]:rotate-180 max-[37.5rem]:opacity-34 max-[37.5rem]:size-6"} data-corner="top-left" />
      <span className={"absolute border-t border-r-0 border-b-0 border-l opacity-40 size-12 border-solid border-current data-[corner=\"top-left\"]:top-[calc(var(--edge-inset)+4rem)] data-[corner=\"top-left\"]:left-(--edge-inset) data-[corner=\"top-right\"]:top-[calc(var(--edge-inset)+4rem)] data-[corner=\"top-right\"]:right-(--edge-inset) data-[corner=\"top-right\"]:rotate-90 data-[corner=\"bottom-left\"]:bottom-(--edge-inset) data-[corner=\"bottom-left\"]:left-(--edge-inset) data-[corner=\"bottom-left\"]:-rotate-90 data-[corner=\"bottom-right\"]:right-(--edge-inset) data-[corner=\"bottom-right\"]:bottom-(--edge-inset) data-[corner=\"bottom-right\"]:rotate-180 max-[37.5rem]:opacity-34 max-[37.5rem]:size-6"} data-corner="top-right" />
      <span className={"absolute border-t border-r-0 border-b-0 border-l opacity-40 size-12 border-solid border-current data-[corner=\"top-left\"]:top-[calc(var(--edge-inset)+4rem)] data-[corner=\"top-left\"]:left-(--edge-inset) data-[corner=\"top-right\"]:top-[calc(var(--edge-inset)+4rem)] data-[corner=\"top-right\"]:right-(--edge-inset) data-[corner=\"top-right\"]:rotate-90 data-[corner=\"bottom-left\"]:bottom-(--edge-inset) data-[corner=\"bottom-left\"]:left-(--edge-inset) data-[corner=\"bottom-left\"]:-rotate-90 data-[corner=\"bottom-right\"]:right-(--edge-inset) data-[corner=\"bottom-right\"]:bottom-(--edge-inset) data-[corner=\"bottom-right\"]:rotate-180 max-[37.5rem]:opacity-34 max-[37.5rem]:size-6"} data-corner="bottom-left" />
      <span className={"absolute border-t border-r-0 border-b-0 border-l opacity-40 size-12 border-solid border-current data-[corner=\"top-left\"]:top-[calc(var(--edge-inset)+4rem)] data-[corner=\"top-left\"]:left-(--edge-inset) data-[corner=\"top-right\"]:top-[calc(var(--edge-inset)+4rem)] data-[corner=\"top-right\"]:right-(--edge-inset) data-[corner=\"top-right\"]:rotate-90 data-[corner=\"bottom-left\"]:bottom-(--edge-inset) data-[corner=\"bottom-left\"]:left-(--edge-inset) data-[corner=\"bottom-left\"]:-rotate-90 data-[corner=\"bottom-right\"]:right-(--edge-inset) data-[corner=\"bottom-right\"]:bottom-(--edge-inset) data-[corner=\"bottom-right\"]:rotate-180 max-[37.5rem]:opacity-34 max-[37.5rem]:size-6"} data-corner="bottom-right" />
    </div>
  );
}

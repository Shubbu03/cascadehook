import type { CSSProperties } from "react";
import { Skeleton, SkeletonRegion } from "@/components/skeleton";

const skeletonHeader =
  "flex items-center justify-between flex-wrap gap-4 [[data-ui~='skeleton-page']_>_[aria-hidden]_>_&]:mb-6";

export type PageSkeletonVariant =
  | "projects" | "overview" | "endpoints" | "endpoint"
  | "events" | "event" | "deliveries" | "delivery"
  | "api-keys" | "settings" | "usage" | "guide";

function HeadingShape() {
  return (
    <div className={skeletonHeader}>
      <div className="grid min-w-0 gap-2.5">
        <Skeleton width={180} height={25} />
        <Skeleton width={260} height={12} />
      </div>
      <Skeleton width={116} height={36} />
    </div>
  );
}

function FiltersShape() {
  return (
    <div className="flex flex-wrap mb-5 pb-5 border-b border-b-border gap-3">
      <Skeleton width={150} height={36} />
      <Skeleton width={210} height={36} />
      <Skeleton width={64} height={36} />
    </div>
  );
}

function TableShape({ columns = 4, rows = 5, contained = true }: {
  columns?: number;
  rows?: number;
  contained?: boolean;
}) {
  const grid = { gridTemplateColumns: `minmax(0, 2fr) repeat(${columns - 1}, minmax(0, 1fr))` };
  return (
    <div className={(contained) ? "rounded-[9px] bg-surface overflow-hidden border border-solid border-border" : "overflow-hidden"}>
      <div className="min-w-130">
        <div className="grid items-center min-h-10 bg-background gap-6 py-3.5 px-4" style={grid}>
          {Array.from({ length: columns }, (_, column) => (
            <Skeleton key={column} width={column === 0 ? "35%" : "60%"} height={10} />
          ))}
        </div>
        {Array.from({ length: rows }, (_, row) => (
          <div data-ui="skeleton-table-row" className="grid items-center min-h-16.75 border-t border-t-border gap-6 py-3.5 px-4" style={grid} key={row}>
            {Array.from({ length: columns }, (_, column) => (
              <div className="grid min-w-0 gap-1.75" key={column}>
                <Skeleton width={column === 0 ? (row % 2 ? "74%" : "92%") : "70%"} height={column === 1 ? 22 : 11} />
                {column === 0 && <Skeleton width="58%" height={9} />}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export function TableSkeleton({ columns = 4, rows = 5, contained = true, label = "Loading records…" }: {
  columns?: number;
  rows?: number;
  contained?: boolean;
  label?: string;
}) {
  return <SkeletonRegion label={label}><TableShape columns={columns} rows={rows} contained={contained} /></SkeletonRegion>;
}

function ProjectCardsShape() {
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,280px),1fr))] gap-4 my-4">
      {Array.from({ length: 3 }, (_, index) => (
        <div className="rounded-[9px] bg-surface overflow-hidden grid grid-cols-[40px_minmax(0,1fr)_16px] items-center min-h-28 border border-solid border-border p-5 gap-4" key={index}>
          <Skeleton width={40} height={40} />
          <div className="grid min-w-0 gap-2.5 in-data-[ui~='skeleton-table-row']:gap-1.75">
            <Skeleton width={index % 2 ? "65%" : "85%"} height={15} />
            <Skeleton width={60} height={10} />
          </div>
          <Skeleton width={16} height={16} />
        </div>
      ))}
    </div>
  );
}

export function ProjectCardsSkeleton() {
  return <SkeletonRegion label="Loading projects…"><ProjectCardsShape /></SkeletonRegion>;
}

function StatsShape({ count = 4 }: { count?: number; }) {
  return (
    <div className="rounded-[9px] bg-surface overflow-hidden grid grid-cols-[repeat(var(--skeleton-stat-columns,4),minmax(0,1fr))] border border-solid border-border [&_>_div]:p-5 [&_>_div+div]:border-l [&_>_div+div]:[border-left-style:solid] [&_>_div+div]:border-l-border @max-[38.75rem]/skeleton-view:grid-cols-2 @max-[38.75rem]/skeleton-view:[&_>_div:nth-child(odd)]:border-l-0 @max-[38.75rem]/skeleton-view:[&_>_div:nth-child(n+3)]:border-t @max-[38.75rem]/skeleton-view:[&_>_div:nth-child(n+3)]:[border-top-style:solid] @max-[38.75rem]/skeleton-view:[&_>_div:nth-child(n+3)]:border-t-border" style={{ "--skeleton-stat-columns": count } as CSSProperties}>
      {Array.from({ length: count }, (_, index) => (
        <div className="grid min-w-0 gap-2.5 in-data-[ui~='skeleton-table-row']:gap-1.75" key={index}>
          <Skeleton width="65%" height={11} />
          <Skeleton width={58} height={27} />
          <Skeleton width="85%" height={10} />
        </div>
      ))}
    </div>
  );
}

export function StatsSkeleton({ count = 4 }: { count?: number; }) {
  return <SkeletonRegion label="Loading usage totals…"><StatsShape count={count} /></SkeletonRegion>;
}

function SetupShape() {
  return (
    <div className="rounded-[9px] bg-surface overflow-hidden border border-solid border-border py-4.5 px-5">
      <div className={skeletonHeader}>
        <Skeleton width={170} height={15} />
        <Skeleton width={120} height={11} />
      </div>
      <div className="flex items-center mt-4.5 mb-2 rounded-md bg-background gap-5 p-4 [&_>_div]:flex-1">
        <div className="grid min-w-0 gap-2.5 in-data-[ui~='skeleton-table-row']:gap-1.75"><Skeleton width="48%" height={14} /><Skeleton width="75%" height={10} /></div>
        <Skeleton width={106} height={34} />
      </div>
      <div className="grid grid-cols-2 gap-y-0 gap-x-7 [&_>_div]:flex [&_>_div]:items-center [&_>_div]:border-b [&_>_div]:border-b-border [&_>_div]:gap-2.5 [&_>_div]:py-3 @max-[38.75rem]/skeleton-view:grid-cols-[1fr]">
        {Array.from({ length: 6 }, (_, index) => (
          <div key={index}><Skeleton width={20} height={20} className="rounded-full" /><Skeleton width={index % 2 ? "58%" : "70%"} /></div>
        ))}
      </div>
    </div>
  );
}

export function SetupSkeleton() {
  return <SkeletonRegion label="Checking project setup…" className="mb-6"><SetupShape /></SkeletonRegion>;
}

function ReadinessShape() {
  return (
    <div>
      <div className="grid grid-cols-3 pt-0 pb-5 gap-3 px-5">
        {[0, 1, 2].map((index) => <div className="grid min-w-0 gap-2.5 in-data-[ui~='skeleton-table-row']:gap-1.75" key={index}><Skeleton width={48} height={10} /><Skeleton width={30} height={23} /></div>)}
      </div>
      {[0, 1, 2].map((index) => (
        <div data-ui="skeleton-list-row" className="flex items-center border-t border-t-border gap-3 py-4 px-5" key={index}>
          <Skeleton width={20} height={20} />
          <div className="grid min-w-0 gap-2.5 in-data-[ui~='skeleton-table-row']:gap-1.75 [[data-ui~='skeleton-list-row']_>_&]:flex-1"><Skeleton width="90%" /><Skeleton width="40%" height={9} /></div>
        </div>
      ))}
    </div>
  );
}

export function EndpointReadinessSkeleton() {
  return <SkeletonRegion label="Loading endpoint readiness…"><ReadinessShape /></SkeletonRegion>;
}

function AttemptsShape() {
  return (
    <div>
      {[0, 1, 2].map((index) => (
        <div className="grid border-t border-t-border gap-3.5 p-5" key={index}>
          <div className={skeletonHeader}><Skeleton width={150} height={14} /><Skeleton width={72} height={22} /></div>
          <Skeleton width="68%" height={10} />
          <Skeleton width={84} height={10} />
        </div>
      ))}
    </div>
  );
}

export function AttemptsSkeleton() {
  return <SkeletonRegion label="Loading attempt history…"><AttemptsShape /></SkeletonRegion>;
}

function FormShape({ fields = 2 }: { fields?: number; }) {
  return (
    <div className="grid gap-5.5">
      {Array.from({ length: fields }, (_, index) => (
        <div className="grid min-w-0 gap-2.5 in-data-[ui~='skeleton-table-row']:gap-1.75" key={index}><Skeleton width={110} height={11} /><Skeleton height={42} /></div>
      ))}
      <Skeleton height={38} />
    </div>
  );
}

export function FormSkeleton({ fields = 2, label = "Loading form…" }: { fields?: number; label?: string; }) {
  return <SkeletonRegion label={label}><FormShape fields={fields} /></SkeletonRegion>;
}

export function NavigationSkeleton({ label = "Loading workspaces…" }: { label?: string; }) {
  return (
    <SkeletonRegion label={label} >
      {[0, 1, 2].map((index) => <div data-ui="skeleton-list-row" className="flex items-center [border-top-style:solid] gap-3 p-2.5 border-0 border-none border-current" key={index}><Skeleton width={28} height={28} /><Skeleton width={index % 2 ? "50%" : "70%"} /></div>)}
    </SkeletonRegion>
  );
}

function DetailShape({ variant }: { variant: "endpoint" | "delivery" | "event"; }) {
  if (variant === "event") return (
    <div className="grid min-w-0 gap-5 in-data-[ui~='skeleton-table-row']:gap-1.75">
      <StatsShape count={2} />
      <div className="rounded-[9px] bg-surface overflow-hidden grid min-h-65 content-start border border-solid border-border p-6 gap-4">
        {[60, 78, 48, 84, 64, 40, 68, 30].map((width, index) => <Skeleton key={index} width={width + "%"} />)}
      </div>
    </div>
  );
  if (variant === "endpoint") return (
    <div className="grid min-w-0 gap-5 in-data-[ui~='skeleton-table-row']:gap-1.75">
      <div className="rounded-[9px] bg-surface overflow-hidden grid grid-cols-[minmax(0,1fr)_minmax(230px,0.55fr)] border border-solid border-border [&_>_div]:p-5.5 [&_>_div]:gap-4.5 [&_>_div+div]:border-l [&_>_div+div]:[border-left-style:solid] [&_>_div+div]:border-l-border @max-[38.75rem]/skeleton-view:grid-cols-[1fr] @max-[38.75rem]/skeleton-view:[&_>_div+div]:border-t @max-[38.75rem]/skeleton-view:[&_>_div+div]:[border-top-style:solid] @max-[38.75rem]/skeleton-view:[&_>_div+div]:border-t-border @max-[38.75rem]/skeleton-view:[&_>_div+div]:border-l-0">
        <div className="grid min-w-0 gap-2.5 in-data-[ui~='skeleton-table-row']:gap-1.75"><Skeleton width={120} /><Skeleton width="90%" height={15} /><Skeleton width="60%" height={10} /></div>
        <div className="grid min-w-0 gap-2.5 in-data-[ui~='skeleton-table-row']:gap-1.75"><Skeleton width={100} /><Skeleton width="85%" height={10} /><Skeleton width={120} height={36} /></div>
      </div>
      <div className="rounded-[9px] bg-surface overflow-hidden border border-solid border-border">
        <div className="grid min-w-0 gap-2.5 p-5 in-data-[ui~='skeleton-table-row']:gap-1.75"><Skeleton width={160} height={14} /><Skeleton width="60%" /><Skeleton width={130} height={26} /></div>
        <div className="grid grid-cols-2 border-t [border-top-style:solid] border-t-border [&_>_div+div]:border-l [&_>_div+div]:[border-left-style:solid] [&_>_div+div]:border-l-border @max-[38.75rem]/skeleton-view:grid-cols-[1fr] @max-[38.75rem]/skeleton-view:[&_>_div+div]:border-t @max-[38.75rem]/skeleton-view:[&_>_div+div]:[border-top-style:solid] @max-[38.75rem]/skeleton-view:[&_>_div+div]:border-t-border @max-[38.75rem]/skeleton-view:[&_>_div+div]:border-l-0">
          {[0, 1].map((index) => <div className="grid min-w-0 gap-2.5 p-5 in-data-[ui~='skeleton-table-row']:gap-1.75" key={index}><Skeleton width={160} height={14} /><Skeleton width="90%" /><Skeleton width="70%" /><Skeleton width={140} height={36} /></div>)}
        </div>
      </div>
    </div>
  );
  return (
    <div className="grid min-w-0 gap-5 in-data-[ui~='skeleton-table-row']:gap-1.75">
      <div data-ui="skeleton-result" className="rounded-[9px] bg-surface overflow-hidden flex items-center border border-solid border-border p-5 gap-4 [&_>_div]:flex-1"><Skeleton width={42} height={42} className="rounded-full" /><div className="grid min-w-0 gap-2.5 in-data-[ui~='skeleton-table-row']:gap-1.75"><Skeleton width="45%" height={18} /><Skeleton width="80%" /></div><Skeleton width={120} height={42} /></div>
      <div className="grid grid-cols-[minmax(0,1fr)_300px] items-start gap-5 @max-[55rem]/skeleton-view:grid-cols-[1fr]">
        <div className="rounded-[9px] bg-surface overflow-hidden border border-solid border-border"><div className="p-5"><Skeleton width={150} height={16} /></div><AttemptsShape /></div>
        <div className="grid min-w-0 rounded-[9px] bg-surface overflow-hidden p-5 gap-2.5 border border-solid border-border in-data-[ui~='skeleton-table-row']:gap-1.75"><Skeleton width={100} height={14} /><Skeleton width="95%" /><Skeleton width="80%" /><div className="h-px bg-border my-1.5" /><Skeleton width={100} height={14} /><Skeleton width="90%" /><div className="h-px bg-border my-1.5" />{[0, 1, 2, 3].map((index) => <Skeleton width="95%" key={index} />)}</div>
      </div>
    </div>
  );
}

function SettingsShape() {
  return (
    <div className="grid min-w-0 gap-5 in-data-[ui~='skeleton-table-row']:gap-1.75">
      <div className="max-w-140 mb-3"><FormShape fields={2} /></div>
      <Skeleton width={150} height={16} />
      <TableShape columns={3} rows={3} />
    </div>
  );
}

export function SettingsSkeleton() {
  return <SkeletonRegion label="Loading settings…"><SettingsShape /></SkeletonRegion>;
}

function UsageShape() {
  return <div className="grid min-w-0 gap-5 in-data-[ui~='skeleton-table-row']:gap-1.75"><StatsShape /><Skeleton width={150} height={16} /><StatsShape count={3} /></div>;
}

export function UsageSkeleton() {
  return <SkeletonRegion label="Loading usage…"><UsageShape /></SkeletonRegion>;
}

export function PageSkeleton({
  variant = "overview",
}: {
  variant?: PageSkeletonVariant;
}) {
  let body;
  switch (variant) {
    case "projects":
      body = <ProjectCardsShape />;
      break;
    case "endpoint":
    case "delivery":
    case "event":
      body = <DetailShape variant={variant} />;
      break;
    case "settings":
      body = <SettingsShape />;
      break;
    case "usage":
      body = <UsageShape />;
      break;
    case "overview":
      body = (
        <div className="grid min-w-0 gap-5 in-data-[ui~='skeleton-table-row']:gap-1.75">
          <SetupShape />
          <StatsShape />
          <div className="grid grid-cols-[minmax(0,1fr)_300px] items-start gap-5 @max-[55rem]/skeleton-view:grid-cols-[1fr]">
            <TableShape />
            <div className="rounded-[9px] bg-surface overflow-hidden border border-solid border-border">
              <div className="p-5">
                <Skeleton width={150} height={15} />
              </div>
              <ReadinessShape />
            </div>
          </div>
        </div>
      );
      break;
    case "guide":
      body = (
        <div className="grid min-w-0 gap-5 in-data-[ui~='skeleton-table-row']:gap-1.75">
          <Skeleton width="75%" />
          <Skeleton width="90%" />
          <div className="rounded-[9px] bg-surface overflow-hidden grid min-h-65 content-start border border-solid border-border p-6 gap-4">
            {[0, 1, 2, 3, 4, 5].map((index) => (
              <Skeleton key={index} width={(65 + index % 3 * 10) + "%"} />
            ))}
          </div>
        </div>
      );
      break;
    default:
      body = (
        <>
          <FiltersShape />
          <TableShape columns={variant === "endpoints" ? 2 : variant === "deliveries" ? 5 : 4} />
        </>
      );
  }
  return (
    <SkeletonRegion
      label={"Loading " + variant.replace("-", " ") + "…"}
      data-ui="skeleton-page"
    >
      <HeadingShape />
      {body}
    </SkeletonRegion>
  );
}

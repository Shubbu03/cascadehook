import type { CSSProperties } from "react";
import { Skeleton, SkeletonRegion } from "@/components/skeleton";

export type PageSkeletonVariant =
  | "projects" | "overview" | "endpoints" | "endpoint"
  | "events" | "event" | "deliveries" | "delivery"
  | "api-keys" | "settings" | "usage" | "guide";

function HeadingShape() {
  return (
    <div className="skeleton-heading">
      <div className="skeleton-stack">
        <Skeleton width={180} height={25} />
        <Skeleton width={260} height={12} />
      </div>
      <Skeleton width={116} height={36} />
    </div>
  );
}

function FiltersShape() {
  return (
    <div className="skeleton-filters">
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
    <div className={"skeleton-table" + (contained ? " skeleton-panel" : "")}>
      <div className="skeleton-table-inner">
        <div className="skeleton-table-head" style={grid}>
          {Array.from({ length: columns }, (_, column) => (
            <Skeleton key={column} width={column === 0 ? "35%" : "60%"} height={10} />
          ))}
        </div>
        {Array.from({ length: rows }, (_, row) => (
          <div className="skeleton-table-row" style={grid} key={row}>
            {Array.from({ length: columns }, (_, column) => (
              <div className="skeleton-stack" key={column}>
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
    <div className="workspace-project-grid">
      {Array.from({ length: 3 }, (_, index) => (
        <div className="skeleton-project-card skeleton-panel" key={index}>
          <Skeleton width={40} height={40} />
          <div className="skeleton-stack">
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

function StatsShape({ count = 4 }: { count?: number }) {
  return (
    <div className="skeleton-stats skeleton-panel" style={{ "--skeleton-stat-columns": count } as CSSProperties}>
      {Array.from({ length: count }, (_, index) => (
        <div className="skeleton-stack" key={index}>
          <Skeleton width="65%" height={11} />
          <Skeleton width={58} height={27} />
          <Skeleton width="85%" height={10} />
        </div>
      ))}
    </div>
  );
}

export function StatsSkeleton({ count = 4 }: { count?: number }) {
  return <SkeletonRegion label="Loading usage totals…"><StatsShape count={count} /></SkeletonRegion>;
}

function SetupShape() {
  return (
    <div className="skeleton-setup skeleton-panel">
      <div className="skeleton-heading">
        <Skeleton width={170} height={15} />
        <Skeleton width={120} height={11} />
      </div>
      <div className="skeleton-setup-next">
        <div className="skeleton-stack"><Skeleton width="48%" height={14} /><Skeleton width="75%" height={10} /></div>
        <Skeleton width={106} height={34} />
      </div>
      <div className="skeleton-checks">
        {Array.from({ length: 6 }, (_, index) => (
          <div key={index}><Skeleton width={20} height={20} className="skeleton-circle" /><Skeleton width={index % 2 ? "58%" : "70%"} /></div>
        ))}
      </div>
    </div>
  );
}

export function SetupSkeleton() {
  return <SkeletonRegion label="Checking project setup…" className="skeleton-setup-region"><SetupShape /></SkeletonRegion>;
}

function ReadinessShape() {
  return (
    <div className="skeleton-readiness">
      <div className="skeleton-readiness-counts">
        {[0, 1, 2].map((index) => <div className="skeleton-stack" key={index}><Skeleton width={48} height={10} /><Skeleton width={30} height={23} /></div>)}
      </div>
      {[0, 1, 2].map((index) => (
        <div className="skeleton-list-row" key={index}>
          <Skeleton width={20} height={20} />
          <div className="skeleton-stack"><Skeleton width="90%" /><Skeleton width="40%" height={9} /></div>
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
    <div className="skeleton-attempts">
      {[0, 1, 2].map((index) => (
        <div className="skeleton-attempt" key={index}>
          <div className="skeleton-heading"><Skeleton width={150} height={14} /><Skeleton width={72} height={22} /></div>
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

function FormShape({ fields = 2 }: { fields?: number }) {
  return (
    <div className="skeleton-form">
      {Array.from({ length: fields }, (_, index) => (
        <div className="skeleton-stack" key={index}><Skeleton width={110} height={11} /><Skeleton height={42} /></div>
      ))}
      <Skeleton height={38} />
    </div>
  );
}

export function FormSkeleton({ fields = 2, label = "Loading form…" }: { fields?: number; label?: string }) {
  return <SkeletonRegion label={label}><FormShape fields={fields} /></SkeletonRegion>;
}

export function NavigationSkeleton({ label = "Loading workspaces…" }: { label?: string }) {
  return (
    <SkeletonRegion label={label} className="skeleton-navigation">
      {[0, 1, 2].map((index) => <div className="skeleton-list-row" key={index}><Skeleton width={28} height={28} /><Skeleton width={index % 2 ? "50%" : "70%"} /></div>)}
    </SkeletonRegion>
  );
}

function DetailShape({ variant }: { variant: "endpoint" | "delivery" | "event" }) {
  if (variant === "event") return (
    <div className="skeleton-stack skeleton-page-body">
      <StatsShape count={2} />
      <div className="skeleton-panel skeleton-payload">
        {[60, 78, 48, 84, 64, 40, 68, 30].map((width, index) => <Skeleton key={index} width={width + "%"} />)}
      </div>
    </div>
  );
  if (variant === "endpoint") return (
    <div className="skeleton-stack skeleton-page-body">
      <div className="skeleton-detail-summary skeleton-panel">
        <div className="skeleton-stack"><Skeleton width={120} /><Skeleton width="90%" height={15} /><Skeleton width="60%" height={10} /></div>
        <div className="skeleton-stack"><Skeleton width={100} /><Skeleton width="85%" height={10} /><Skeleton width={120} height={36} /></div>
      </div>
      <div className="skeleton-panel">
        <div className="skeleton-section skeleton-stack"><Skeleton width={160} height={14} /><Skeleton width="60%" /><Skeleton width={130} height={26} /></div>
        <div className="skeleton-security-grid">
          {[0, 1].map((index) => <div className="skeleton-section skeleton-stack" key={index}><Skeleton width={160} height={14} /><Skeleton width="90%" /><Skeleton width="70%" /><Skeleton width={140} height={36} /></div>)}
        </div>
      </div>
    </div>
  );
  return (
    <div className="skeleton-stack skeleton-page-body">
      <div className="skeleton-result skeleton-panel"><Skeleton width={42} height={42} className="skeleton-circle" /><div className="skeleton-stack"><Skeleton width="45%" height={18} /><Skeleton width="80%" /></div><Skeleton width={120} height={42} /></div>
      <div className="skeleton-workspace-grid">
        <div className="skeleton-panel"><div className="skeleton-section"><Skeleton width={150} height={16} /></div><AttemptsShape /></div>
        <div className="skeleton-panel skeleton-stack skeleton-section"><Skeleton width={100} height={14} /><Skeleton width="95%" /><Skeleton width="80%" /><div className="skeleton-divider" /><Skeleton width={100} height={14} /><Skeleton width="90%" /><div className="skeleton-divider" />{[0, 1, 2, 3].map((index) => <Skeleton width="95%" key={index} />)}</div>
      </div>
    </div>
  );
}

function SettingsShape() {
  return (
    <div className="skeleton-stack skeleton-page-body">
      <div className="skeleton-settings-form"><FormShape fields={2} /></div>
      <Skeleton width={150} height={16} />
      <TableShape columns={3} rows={3} />
    </div>
  );
}

export function SettingsSkeleton() {
  return <SkeletonRegion label="Loading settings…"><SettingsShape /></SkeletonRegion>;
}

function UsageShape() {
  return <div className="skeleton-stack skeleton-page-body"><StatsShape /><Skeleton width={150} height={16} /><StatsShape count={3} /></div>;
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
        <div className="skeleton-stack skeleton-page-body">
          <SetupShape />
          <StatsShape />
          <div className="skeleton-workspace-grid">
            <TableShape />
            <div className="skeleton-panel">
              <div className="skeleton-section">
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
        <div className="skeleton-stack skeleton-page-body">
          <Skeleton width="75%" />
          <Skeleton width="90%" />
          <div className="skeleton-panel skeleton-payload">
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
      className="skeleton-page"
    >
      <HeadingShape />
      {body}
    </SkeletonRegion>
  );
}

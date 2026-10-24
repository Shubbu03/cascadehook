import { Brand } from "@/components/brand";

export function WorkspaceLoading() {
  return (
    <main id="main-content" className="page-width workspace-main">
      <Brand />
      <ContentLoading />
    </main>
  );
}

export function ContentLoading() {
  return (
    <div className="workspace-loading" role="status">
      <span className="sr-only">Loading your workspace…</span>
      <div className="skeleton" />
      <div className="skeleton" />
    </div>
  );
}

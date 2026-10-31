import { DocsLayout } from "fumadocs-ui/layouts/docs";
import { DocsThemeSwitch } from "@/components/theme-transition-provider";
import { source } from "@/lib/source";

export default function DocumentationLayout({ children }: { children: React.ReactNode }) {
  return (
    <DocsLayout
      tree={source.getPageTree()}
      nav={{
        url: "/docs",
        title: (
          <span className="brand">
            <span className="brand-mark" aria-hidden="true"><span /><span /><span /></span>
            <span>cascadehook<span className="brand-period">.</span></span>
            <span className="docs-brand-label">docs</span>
          </span>
        ),
      }}
      links={[]}
      tabs={false}
      themeSwitch={{ enabled: false }}
      sidebar={{
        defaultOpenLevel: 1,
        footer: <DocsThemeSwitch />,
      }}
    >
      {children}
    </DocsLayout>
  );
}

import Link from "next/link";

export function Brand({ href = "/dashboard" }: { href?: "/" | "/dashboard" | null; }) {
  const content = (
    <>
      <span className={"flex flex-col w-7.25 gap-1 [&_span]:block [&_span]:w-4.75 [&_span]:h-1.25 [&_span]:rounded-[1px] [&_span]:bg-accent in-data-[ui~='sidebar-brand']:transform-[scale(0.85)] in-data-[ui~='sidebar-brand']:origin-[left_center] in-data-[ui~='sidebar-brand']:-mr-1 [&_span:nth-child(2)]:ml-1.25 [&_span:nth-child(3)]:ml-2.5 [[data-ui~='dashboard-shell'][data-collapsed=true]_[data-ui~='dashboard-sidebar']_&]:origin-center [[data-ui~='dashboard-shell'][data-collapsed=true]_[data-ui~='dashboard-sidebar']_&]:mr-0"} aria-hidden="true">
        <span />
        <span />
        <span />
      </span>
      <span>
        cascadehook<span className="text-accent">.</span>
      </span>
    </>
  );

  if (href === null) return <span className={"inline-flex items-center w-fit text-[23px] font-semibold [letter-spacing:-1px] leading-none gap-2.75 max-[37.5rem]:in-data-[ui~='landing-header']:text-[20px] in-data-[ui~='workspace-header']:shrink-0 in-data-[ui~='workspace-header']:text-[22px] in-data-[ui~='sidebar-brand']:text-[20px] in-data-[ui~='sidebar-brand']:gap-2.5 [[data-ui~='dashboard-shell'][data-collapsed=true]_[data-ui~='dashboard-sidebar']_&_>_span:last-child]:hidden max-[37.5rem]:in-data-[ui~='auth-mobile-brand']:text-[20px] max-[37.5rem]:in-data-[ui~='workspace-header']:text-[20px] max-[37.5rem]:in-data-[ui~='onboarding-header']:text-[20px]"}>{content}</span>;

  return (
    <Link
      href={href}
      className={"inline-flex items-center w-fit text-[23px] font-semibold [letter-spacing:-1px] leading-none gap-2.75 max-[37.5rem]:in-data-[ui~='landing-header']:text-[20px] in-data-[ui~='workspace-header']:shrink-0 in-data-[ui~='workspace-header']:text-[22px] in-data-[ui~='sidebar-brand']:text-[20px] in-data-[ui~='sidebar-brand']:gap-2.5 [[data-ui~='dashboard-shell'][data-collapsed=true]_[data-ui~='dashboard-sidebar']_&_>_span:last-child]:hidden max-[37.5rem]:in-data-[ui~='auth-mobile-brand']:text-[20px] max-[37.5rem]:in-data-[ui~='workspace-header']:text-[20px] max-[37.5rem]:in-data-[ui~='onboarding-header']:text-[20px]"}
      aria-label={href === "/dashboard" ? "Cascadehook dashboard" : "Cascadehook home"}
    >
      {content}
    </Link>
  );
}

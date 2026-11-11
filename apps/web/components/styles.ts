// Class lists shared by more than one feature. Keep each a complete literal so Tailwind can see it.

export const dashboardMain =
  "w-full min-w-0 min-h-[calc(100svh-var(--topbar-height,60px))] pt-7 pb-16 m-0 px-8 max-[56.25rem]:pt-6 max-[56.25rem]:pb-12 max-[56.25rem]:px-6 max-[37.5rem]:pt-5.5 max-[37.5rem]:pb-10 max-[37.5rem]:px-4.5";

export const dataTable =
  "w-full border-collapse text-[13px] text-left [&_th]:border-b [&_th]:border-b-border [&_th]:bg-background [&_th]:text-muted [&_th]:text-[12px] [&_th]:font-medium [&_th]:whitespace-nowrap [&_th]:py-3.25 [&_th]:px-4 [&_td]:align-top [&_td]:leading-[1.7] [&_td]:min-w-27.5 [&_td]:p-4 [&_td_code]:text-[11px] [&_td_code]:wrap-anywhere [&_tr+tr_td]:border-t [&_tr+tr_td]:border-t-border [[data-ui~='dashboard-main']_&_th]:py-2.75 [[data-ui~='dashboard-main']_&_th]:px-4 [[data-ui~='dashboard-main']_&_td]:min-w-27.5 [[data-ui~='dashboard-main']_&_td]:py-3.25 [[data-ui~='dashboard-main']_&_td]:px-4 [&_tbody_tr:hover]:bg-surface-hover max-[37.5rem]:[&_td]:p-3";

export const emptyState =
  "grid justify-items-start rounded-xl bg-surface gap-3.5 p-7 border border-solid border-border [&_h3]:text-[20px] [&_h3]:tracking-[-0.02em] [&_p]:text-muted [&_p]:text-[14px] [&_p]:leading-[1.7] in-data-[ui~='dashboard-main']:flex in-data-[ui~='dashboard-main']:flex-col in-data-[ui~='dashboard-main']:items-center in-data-[ui~='dashboard-main']:justify-center in-data-[ui~='dashboard-main']:min-h-55 in-data-[ui~='dashboard-main']:bg-transparent in-data-[ui~='dashboard-main']:text-center in-data-[ui~='dashboard-main']:gap-3 in-data-[ui~='dashboard-main']:py-8 in-data-[ui~='dashboard-main']:px-6 in-data-[ui~='dashboard-main']:border-dashed [[data-ui~='dashboard-main']_&_h2]:text-[17px] [[data-ui~='dashboard-main']_&_h2]:m-0 [[data-ui~='dashboard-main']_&_h3]:text-[17px] [[data-ui~='dashboard-main']_&_h3]:m-0 [[data-ui~='dashboard-main']_&_p]:max-w-120 [[data-ui~='dashboard-main']_&_p]:text-[13px] [[data-ui~='dashboard-main']_&_p]:leading-[1.7] [[data-ui~='dashboard-main']_&_p]:m-0 max-[37.5rem]:in-data-[ui~='dashboard-main']:min-h-50 max-[37.5rem]:in-data-[ui~='dashboard-main']:px-4.5";

export const errorText =
  "text-danger text-[13px] my-3";

export const filterBar =
  "flex [align-items:end] flex-wrap mt-4.5 mb-6 gap-3 in-data-[ui~='dashboard-main']:mt-0 in-data-[ui~='dashboard-main']:mb-5 in-data-[ui~='dashboard-main']:pt-0 in-data-[ui~='dashboard-main']:pb-5 in-data-[ui~='dashboard-main']:border-b in-data-[ui~='dashboard-main']:border-b-border in-data-[ui~='dashboard-main']:gap-3 in-data-[ui~='dashboard-main']:mx-0 in-data-[ui~='dashboard-main']:px-0 max-[37.5rem]:in-data-[ui~='dashboard-main']:gap-2.5";

export const filterControl =
  "in-data-[ui~='dashboard-main']:w-55 in-data-[ui~='dashboard-main']:min-h-9 in-data-[ui~='dashboard-main']:py-1.75 in-data-[ui~='dashboard-main']:px-2.5 in-data-[ui~='dashboard-main']:text-[13px]/5 max-[37.5rem]:in-data-[ui~='dashboard-main']:w-full max-[37.5rem]:in-data-[ui~='dashboard-main']:min-w-0 max-[37.5rem]:in-data-[ui~='dashboard-main']:text-[16px] max-[37.5rem]:w-full max-[37.5rem]:text-[16px] min-h-10.5 rounded-md text-foreground text-[14px] max-w-full min-w-0 w-52.5 py-2.25 px-2.75 max-[32.5rem]:text-[16px]";

export const filterField =
  "grid gap-1.75 [&_>_span]:text-[12px] [&_>_span]:font-medium min-w-0 in-data-[ui~='dashboard-main']:flex-[0_1_auto] in-data-[ui~='dashboard-main']:gap-1.5 max-[37.5rem]:flex-[1_1_150px] max-[37.5rem]:[[data-ui~='dashboard-main']_[data-ui~='activity-filters']_&]:flex-[1_1_140px]";

export const formField =
  "grid mb-4.5 gap-2 [&_>_span]:text-[13px] [&_>_span]:font-medium [&_>_label]:text-[13px] [&_>_label]:font-medium";

export const leadText =
  "mt-3 mb-4.5 text-muted text-[14px] leading-[1.8] max-w-162.5 in-data-[ui~='dashboard-main']:text-[13px]";

export const messageCard =
  "grid justify-items-start rounded-xl bg-surface gap-3.5 p-7 border border-solid border-border [&_h3]:text-[20px] [&_h3]:tracking-[-0.02em] [&_p]:text-muted [&_p]:text-[14px] [&_p]:leading-[1.7]";

export const pageContainer =
  "w-[min(1200px,calc(100%-80px))] pt-8 pb-16 mx-auto max-[65.625rem]:w-[calc(100%-56px)] max-[37.5rem]:w-[calc(100%-40px)] max-[37.5rem]:pt-6 max-[37.5rem]:pb-12";

export const panelHeading =
  "flex items-center flex-wrap gap-2 [&_>_svg]:shrink-0 [&_>_svg]:text-muted [&_h2]:font-medium [&_h2]:tracking-[-0.01em] [&_h2]:text-sm/normal";

export const panelText =
  "mt-2 mb-3.5 text-muted text-[13px] leading-[1.65] wrap-anywhere [[data-ui~='endpoint-security-card']_>_&:last-child]:mb-0";

export const prose =
  "max-w-185 leading-[1.85] mx-auto [&_h1]:mb-6.5 [&_h1]:text-[clamp(36px,5vw,56px)] [&_h1]:font-medium [&_h1]:leading-[1.12] [&_h1]:tracking-[-.045em] [&_h2]:mt-8 [&_h2]:text-[21px] [&_h2]:leading-[1.4] [&_h2]:tracking-[-.02em] [&_p]:mt-4 [&_p]:text-muted [&_p]:text-[14px] [&_ul]:mt-4 [&_ul]:text-muted [&_ul]:text-[14px] [&_ul]:pl-5.5 [&_ul]:[list-style:disc] [&_a]:underline [&_a]:underline-offset-[3px]";

export const securityCard =
  "min-w-0 py-5 px-5.5 [[data-ui~='endpoint-security-card']+&]:border-l [[data-ui~='endpoint-security-card']+&]:[border-left-style:solid] [[data-ui~='endpoint-security-card']+&]:border-l-border @max-[38.75rem]/endpoint-settings:p-4 @max-[47.5rem]/endpoint-settings:[[data-ui~='endpoint-security-card']+&]:border-t @max-[47.5rem]/endpoint-settings:[[data-ui~='endpoint-security-card']+&]:[border-top-style:solid] @max-[47.5rem]/endpoint-settings:[[data-ui~='endpoint-security-card']+&]:border-t-border @max-[47.5rem]/endpoint-settings:[[data-ui~='endpoint-security-card']+&]:border-l-0";

export const textLink =
  "inline-flex items-center text-[14px] font-medium gap-2 [&:hover]:underline [&:hover]:underline-offset-4 in-data-[ui~='project-overview']:text-[12px] [[data-ui~='dashboard-main']_>_section_>_&:first-child]:mb-4.5 [[data-ui~='dashboard-main']_>_section_>_&:first-child]:text-[12px] [[data-ui~='project-content']_>_section_>_&:first-child]:mb-4.5 [[data-ui~='project-content']_>_section_>_&:first-child]:text-[12px]";

export const warningBanner =
  "flex items-center flex-wrap mt-0 mb-5 rounded-md text-warning bg-warning-subtle text-[12px] leading-[1.6] gap-2.5 py-2.5 px-3 mx-0 border border-solid border-border";

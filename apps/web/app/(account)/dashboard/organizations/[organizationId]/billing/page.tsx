import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { OrganizationBilling } from "@/features/billing/organization-billing";
import { PageSkeleton } from "@/features/workspace/skeletons";
import { uuidPattern } from "@/lib/format";
import { requireSession } from "@/lib/server/session";
export const instant=false;
export const metadata:Metadata={title:"Billing"};
async function Content({params}:{params:Promise<{organizationId:string}>}){
 await requireSession();const {organizationId}=await params;if(!uuidPattern.test(organizationId))notFound();
 return <OrganizationBilling key={organizationId} organizationId={organizationId}/>;
}
export default function Page(props:{params:Promise<{organizationId:string}>}){
 return <Suspense fallback={<main id="main-content" className="dashboard-main"><PageSkeleton variant="usage"/></main>}><Content {...props}/></Suspense>;
}

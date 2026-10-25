import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import { EndpointForm } from "@/features/endpoints/endpoint-form";

export const metadata: Metadata = { title: "Register endpoint" };
export default function NewEndpointPage() {
  return (
    <section>
      <PageHeader title="Register endpoint" />
      <EndpointForm />
    </section>
  );
}

import type { Metadata } from "next";
import { EndpointForm } from "@/features/endpoints/endpoint-form";

export const metadata: Metadata = { title: "Register endpoint" };
export default function NewEndpointPage() {
  return (
    <section>
      <div className="workspace-section-heading">
        <div>
          <h2>Register an endpoint</h2>
          <p>Start with a destination and the events it should receive.</p>
        </div>
      </div>
      <EndpointForm />
    </section>
  );
}

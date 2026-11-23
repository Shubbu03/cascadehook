import type { Metadata } from "next";
import { NotFoundPage } from "@/features/marketing/not-found-page";

export const metadata: Metadata = {
  title: "Page not found",
  description: "The page you were looking for doesn't exist on Cascadehook.",
};

export default function NotFound() {
  return <NotFoundPage />;
}

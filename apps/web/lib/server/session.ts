import "server-only";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { cache } from "react";
import { isAuthConfigured } from "./auth";

export const requireSession = cache(async () => {
  await connection();
  if (!isAuthConfigured()) redirect("/sign-in");
  return auth.protect();
});

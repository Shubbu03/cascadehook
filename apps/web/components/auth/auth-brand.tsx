"use client";

import { useAuth } from "@clerk/nextjs";
import { Brand } from "@/components/brand";

export function AuthBrand() {
  const { isLoaded, isSignedIn } = useAuth();
  return <Brand href={!isLoaded || isSignedIn ? "/dashboard" : "/"} />;
}

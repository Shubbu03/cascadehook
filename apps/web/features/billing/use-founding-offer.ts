"use client";

import { useEffect, useState } from "react";
import type { FoundingOffer } from "@/lib/plans";

export function useFoundingOffer() {
  const [offer, setOffer] = useState<FoundingOffer | null>(null);
  useEffect(() => {
    const base = process.env.NEXT_PUBLIC_API_BASE_URL;
    if (!base) return;
    const controller = new AbortController();
    fetch(base.replace(/\/$/, "") + "/v1/billing/plans", { signal: controller.signal })
      .then((response) => (response.ok ? response.json() : null))
      .then((body: { founding?: FoundingOffer | null } | null) => {
        if (body?.founding?.active && body.founding.percent > 0 && body.founding.remaining > 0) setOffer(body.founding);
      })
      .catch(() => {});
    return () => controller.abort();
  }, []);
  return offer;
}

"use client";

import { Analytics } from "@vercel/analytics/next";
import { limparUrlAnalytics } from "@/lib/analytics";

export function AnalyticsAxis() {
  return <Analytics beforeSend={(evento) => ({ ...evento, url: limparUrlAnalytics(evento.url) })} />;
}

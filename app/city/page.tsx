import { Suspense } from "react";
import type { Metadata } from "next";
import { CityScreen } from "@/components/ui/CityScreen";

export const metadata: Metadata = { title: "City · CodeLens" };

export default function CityPage() {
  return (
    <Suspense fallback={<div className="grid h-screen place-items-center text-ink-soft">Loading city…</div>}>
      <CityScreen />
    </Suspense>
  );
}

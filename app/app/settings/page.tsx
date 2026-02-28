"use client";

import dynamic from "next/dynamic";
import { Spinner } from "@/components/ui/spinner";

const SettingsContent = dynamic(() => import("./settings-content"), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center py-20">
      <Spinner />
    </div>
  ),
});

export default function SettingsPage() {
  return <SettingsContent />;
}

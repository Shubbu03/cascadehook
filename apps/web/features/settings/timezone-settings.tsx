"use client";

import { useState } from "react";
import { Select } from "@/components/select";
import { setTimezone, useTimezonePreference } from "@/lib/display-preferences";
import { SettingsRow, SettingsSection } from "./settings-layout";

export function TimezoneSettings() {
  const timezone = useTimezonePreference();
  const [message, setMessage] = useState("Preferences are saved on this browser.");
  return (
    <>
      <SettingsSection title="Date & time" description="Use a consistent timezone throughout events, deliveries, notifications, and settings.">
        <SettingsRow title="Display timezone" description="Display preferences do not change delivery scheduling or UTC quota periods.">
          <label className="sr-only" htmlFor="settings-timezone">Display timezone</label>
          <Select id="settings-timezone" value={timezone} className="min-h-10 min-w-44 rounded-md px-3 py-2 text-[13px]"
            onChange={(event) => {
              const next = event.target.value;
              if (next !== "utc" && next !== "local") return;
              setMessage(setTimezone(next) ? "Preferences saved on this browser." : "Timezone changed, but this browser couldn’t save your preference.");
            }}>
            <option value="utc">UTC</option><option value="local">Local timezone</option>
          </Select>
        </SettingsRow>
      </SettingsSection>
      <p role="status" className="text-[12px]/7 text-muted">{message}</p>
    </>
  );
}

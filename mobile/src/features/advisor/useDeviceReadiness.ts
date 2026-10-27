import { useEffect, useState } from "react";
import { Platform } from "react-native";
import * as Battery from "expo-battery";
/** Values are measured on supported devices; a web preview never invents phone telemetry. */
export function useDeviceReadiness() {
  const [result, setResult] = useState<{
    battery: number | null;
    spaceMB: number | null;
  }>({ battery: null, spaceMB: null });
  useEffect(() => {
    if (Platform.OS === "web") return;
    let active = true;
    void (async () => {
      let battery: number | null = null,
        spaceMB: number | null = null;
      try {
        if (await Battery.isAvailableAsync()) {
          const level = await Battery.getBatteryLevelAsync();
          if (level >= 0) battery = level;
        }
      } catch {}
      try {
        const { Paths } =
          require("expo-file-system") as typeof import("expo-file-system");
        spaceMB = Math.floor(Paths.availableDiskSpace / 1048576);
      } catch {}
      if (active) setResult({ battery, spaceMB });
    })();
    return () => {
      active = false;
    };
  }, []);
  return result;
}

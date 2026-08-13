import {
  Cctv,
  Gamepad2,
  HardDrive,
  Laptop,
  Lightbulb,
  Monitor,
  MonitorSmartphone,
  Printer,
  Router,
  Smartphone,
  Speaker,
  Tablet,
  Tv,
  Watch,
  type LucideIcon,
} from "lucide-react";

const ICON_RULES: ReadonlyArray<[RegExp, LucideIcon]> = [
  [/iphone|phone/i, Smartphone],
  [/ipad|tablet/i, Tablet],
  [/macbook|laptop/i, Laptop],
  [/imac|mac\b|desktop|\bpc\b/i, Monitor],
  [/appletv|\btv\b/i, Tv],
  [/watch/i, Watch],
  [/homepod|speaker|sonos/i, Speaker],
  [/router|gateway|access/i, Router],
  [/camera|cam\b/i, Cctv],
  [/playstation|xbox|switch\b|game/i, Gamepad2],
  [/printer/i, Printer],
  [/nas\b|server|storage/i, HardDrive],
  [/light|bulb|plug/i, Lightbulb],
];

export function deviceIcon(iconId?: string): LucideIcon {
  if (iconId) {
    for (const [pattern, icon] of ICON_RULES) {
      if (pattern.test(iconId)) return icon;
    }
  }
  return MonitorSmartphone;
}

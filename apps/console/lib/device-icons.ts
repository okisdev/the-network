import {
  Cctv,
  CircleQuestionMark,
  Gamepad2,
  HardDrive,
  Laptop,
  Lightbulb,
  Monitor,
  Printer,
  Router,
  Smartphone,
  Speaker,
  Tablet,
  Tv,
  Watch,
} from "lucide-react";
import type { ComponentType } from "react";
import { AppleIcon } from "@/components/icons/apple";
import { XiaomiIcon } from "@/components/icons/xiaomi";

export type DeviceGlyph = ComponentType<{ className?: string }>;

const APPLE_PATTERN =
  /com\.apple|\b(apple|iphone|ipad|ipod|imac|macbook|mac|airpods?|homepod|watch)\b/i;

const XIAOMI_PATTERN =
  /^(xiaomi|redmi|mijia|zhimi|yeelink|yeelight|lumi|aqara|chuangmi|roborock|rockrobo|viomi|yunmi|dreame|dmaker|deerma|dayang|cgllc|miaomiaoce|isa)[-_.]|xiaomi|redmi|mijia/i;

const FORM_RULES: ReadonlyArray<[RegExp, DeviceGlyph]> = [
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

export function deviceIcon(iconId?: string, name?: string): DeviceGlyph {
  const identity = [iconId, name].filter(Boolean).join(" ");
  if (identity !== "") {
    if (APPLE_PATTERN.test(identity)) return AppleIcon;
    if (XIAOMI_PATTERN.test(identity)) return XiaomiIcon;
    for (const [pattern, icon] of FORM_RULES) {
      if (pattern.test(identity)) return icon;
    }
  }
  return CircleQuestionMark;
}

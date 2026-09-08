/** IANA timezone ต่อ Ergast circuitId — fallback เป็นเวลาไทย */
export const CIRCUIT_TZ: Record<string, string> = {
  albert_park: "Australia/Melbourne",
  shanghai: "Asia/Shanghai",
  suzuka: "Asia/Tokyo",
  bahrain: "Asia/Bahrain",
  jeddah: "Asia/Riyadh",
  miami: "America/New_York",
  imola: "Europe/Rome",
  monaco: "Europe/Monaco",
  catalunya: "Europe/Madrid",
  madring: "Europe/Madrid",
  villeneuve: "America/Toronto",
  red_bull_ring: "Europe/Vienna",
  silverstone: "Europe/London",
  hungaroring: "Europe/Budapest",
  spa: "Europe/Brussels",
  zandvoort: "Europe/Amsterdam",
  monza: "Europe/Rome",
  baku: "Asia/Baku",
  marina_bay: "Asia/Singapore",
  americas: "America/Chicago",
  rodriguez: "America/Mexico_City",
  interlagos: "America/Sao_Paulo",
  vegas: "America/Los_Angeles",
  losail: "Asia/Qatar",
  yas_marina: "Asia/Dubai",
  sepang: "Asia/Kuala_Lumpur",
  portimao: "Europe/Lisbon",
  mugello: "Europe/Rome",
  nurburgring: "Europe/Berlin",
  istanbul: "Europe/Istanbul",
};

export const TH_TZ = "Asia/Bangkok";

export const circuitTz = (circuitId?: string) =>
  CIRCUIT_TZ[circuitId ?? ""] ?? TH_TZ;

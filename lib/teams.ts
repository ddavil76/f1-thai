export const TEAM_COLOR: Record<string, string> = {
  red_bull: "#3671C6",
  ferrari: "#E8002D",
  mercedes: "#27F4D2",
  mclaren: "#FF8000",
  aston_martin: "#229971",
  alpine: "#00A1E8",
  williams: "#1868DB",
  rb: "#6692FF",
  sauber: "#01C00E",
  haas: "#B6BABD",
  audi: "#BB0A30",
  cadillac: "#B3995D",
};

export const teamColor = (id?: string) => TEAM_COLOR[id ?? ""] ?? "#666666";

// Join key between the GeoJSON "freguesia" property and the backend zone_name.
// Lowercase, strip accents, drop the "União das freguesias de" prefix.
export function normFreguesia(name: string | undefined | null): string {
  if (!name) return "";
  const noAccents = name.normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
  let s = noAccents.toLowerCase().replace(/-/g, " ").replace(/\s+/g, " ").trim();
  const prefixes = [
    "uniao das freguesias de ",
    "uniao de freguesias de ",
    "freguesia de ",
    "freguesia da ",
  ];
  for (const p of prefixes) {
    if (s.startsWith(p)) {
      s = s.slice(p.length);
      break;
    }
  }
  return s;
}

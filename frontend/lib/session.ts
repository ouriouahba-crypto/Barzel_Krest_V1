// Tiny module-level bridge: each page's useGaia() publishes its current class
// and focus so the memo modal (mounted in the shared Sidebar, outside any page
// state) can prefill its form. Read once when the modal opens.

export interface MemoDefaults {
  assetClass: string;
  focusZone: string;
  cityZoneId: string;
  freguesias: { id: string; label: string }[];
}

let current: MemoDefaults = {
  assetClass: "residential",
  focusZone: "vilanovadegaia",
  cityZoneId: "vilanovadegaia",
  freguesias: [],
};

export function setMemoDefaults(d: MemoDefaults) {
  current = d;
}
export function getMemoDefaults(): MemoDefaults {
  return current;
}

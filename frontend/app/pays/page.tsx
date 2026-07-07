"use client";

// Choix du pays (étape 1) : carte blueprint (lot 2), enveloppée par la transition
// continue du lot 4 (MapEntry) : la sélection ville fait toujours setSlug +
// navigation dashboard, habillée d'un rideau navy sans flash.

import { MapEntry } from "@/components/entry/MapEntry";

export default function PaysPage() {
  return <MapEntry initialStep="country" />;
}

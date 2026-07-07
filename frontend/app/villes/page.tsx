"use client";

// Choix de la ville (étape 2) : même carte blueprint que /pays, ouverte sur le
// pays courant zoomé. Enveloppée par la transition continue du lot 4 (MapEntry) :
// setSlug + navigation dashboard, habillée d'un rideau navy sans flash.

import { MapEntry } from "@/components/entry/MapEntry";

export default function VillesPage() {
  return <MapEntry initialStep="city" />;
}

"use server";

import { removeCreation, saveCreation, type CreationArea, type CreationKind } from "@/lib/creations";

export async function storeCreation(input: {
  area: CreationArea;
  kind: CreationKind;
  title: string;
  body: string;
  media?: string | null;
}) {
  return saveCreation(input).catch(() => null);
}

export async function discardCreation(id: string) {
  return removeCreation(id).catch(() => false);
}

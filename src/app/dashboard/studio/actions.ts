"use server";

import { removeCreation, saveCreation, updateCreation, type CreationArea, type CreationKind } from "@/lib/media-pieces";

export async function storeCreation(input: {
  area: CreationArea;
  kind: CreationKind;
  title: string;
  body: string;
  media?: string | null;
}) {
  return saveCreation(input).catch(() => null);
}

export async function reviseCreation(input: {
  id: string;
  title: string;
  body: string;
  media?: string | null;
}) {
  return updateCreation(input).catch(() => null);
}

export async function discardCreation(id: string) {
  return removeCreation(id).catch(() => false);
}

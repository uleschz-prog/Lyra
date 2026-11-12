"use server";

import { removeCreation } from "@/lib/media-pieces";

export async function discardCreation(id: string) {
  return removeCreation(id).catch(() => false);
}

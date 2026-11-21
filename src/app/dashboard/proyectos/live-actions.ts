"use server";

import { revalidatePath } from "next/cache";

import { getCurrentUser } from "@/lib/auth/profile";
import { liveAppsAvailable } from "@/lib/liveapps/config";
import { addMember, enableLiveSpace, resetMemberPin, saveBranches, setMemberActive, setSpaceStatus, type MemberView } from "@/lib/liveapps/core";
import type { LiveBranch } from "@/lib/liveapps/manifest";
import { manifestFromFiles } from "@/lib/liveapps/project";
import { getPrisma } from "@/lib/prisma";
import { getProjectVersionFiles } from "@/lib/projects/queries";
import { getPublishState } from "@/lib/publish/core";

type Fail = { ok: false; error: string };

async function owner() {
  const user = await getCurrentUser();
  return user ?? null;
}

function done(projectId: string) {
  revalidatePath(`/dashboard/proyectos/${projectId}`);
}

/** Activa datos en vivo con el esquema de la versión publicada (o la última). */
export async function enableLiveDataAction(projectId: string): Promise<{ ok: true; adminPin: string | null } | Fail> {
  const user = await owner();
  if (!user) return { ok: false, error: "Inicia sesión para continuar." };
  if (!liveAppsAvailable(user)) return { ok: false, error: "Los datos en vivo todavía no están disponibles en tu cuenta." };
  const publish = await getPublishState(getPrisma(), user.id, projectId).catch(() => null);
  const version = await getProjectVersionFiles(user.id, projectId, publish?.versionNumber ?? undefined);
  const result = await enableLiveSpace(getPrisma(), { userId: user.id, projectId, manifest: manifestFromFiles(version?.files) });
  if (!result.ok) return { ok: false, error: result.error };
  done(projectId);
  return { ok: true, adminPin: result.adminPin };
}

export async function addMemberAction(projectId: string, input: { name: string; role: string; branchId: string | null }): Promise<{ ok: true; pin: string; member: MemberView } | Fail> {
  const user = await owner();
  if (!user) return { ok: false, error: "Inicia sesión para continuar." };
  const result = await addMember(getPrisma(), { userId: user.id, projectId, ...input });
  if (!result.ok) return { ok: false, error: result.error };
  done(projectId);
  return result;
}

export async function resetPinAction(projectId: string, memberId: string): Promise<{ ok: true; pin: string } | Fail> {
  const user = await owner();
  if (!user) return { ok: false, error: "Inicia sesión para continuar." };
  const result = await resetMemberPin(getPrisma(), { userId: user.id, projectId, memberId });
  if (!result.ok) return { ok: false, error: result.error };
  done(projectId);
  return result;
}

export async function setMemberActiveAction(projectId: string, memberId: string, active: boolean): Promise<{ ok: true } | Fail> {
  const user = await owner();
  if (!user) return { ok: false, error: "Inicia sesión para continuar." };
  const result = await setMemberActive(getPrisma(), { userId: user.id, projectId, memberId, active });
  if (!result.ok) return { ok: false, error: result.error };
  done(projectId);
  return { ok: true };
}

export async function saveBranchesAction(projectId: string, branches: Partial<LiveBranch>[]): Promise<{ ok: true; branches: LiveBranch[] } | Fail> {
  const user = await owner();
  if (!user) return { ok: false, error: "Inicia sesión para continuar." };
  const result = await saveBranches(getPrisma(), { userId: user.id, projectId, branches });
  if (!result.ok) return { ok: false, error: result.error };
  done(projectId);
  return result;
}

export async function setLiveStatusAction(projectId: string, active: boolean): Promise<{ ok: true } | Fail> {
  const user = await owner();
  if (!user) return { ok: false, error: "Inicia sesión para continuar." };
  const result = await setSpaceStatus(getPrisma(), { userId: user.id, projectId, active });
  if (!result.ok) return { ok: false, error: result.error };
  done(projectId);
  return { ok: true };
}

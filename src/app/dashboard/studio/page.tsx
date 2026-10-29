import type { Metadata } from "next";

import { CreativeStudio } from "@/components/studio/creative-studio";
import { getCurrentUser } from "@/lib/auth/profile";
import { listCreations } from "@/lib/media-pieces";
import { getActiveVideoGeneration } from "@/lib/studio/video-generations";
import { getVideoQuotaBalance } from "@/lib/studio/video-quotas";

export const metadata: Metadata = {
  title: "Estudio Creativo",
};

export default async function StudioPage() {
  const user = await getCurrentUser();
  const [pieces, activeVideoGeneration, videoQuota] = await Promise.all([
    listCreations("studio").catch(() => []),
    user ? getActiveVideoGeneration(user.id).catch(() => null) : Promise.resolve(null),
    user ? getVideoQuotaBalance(user.id).catch(() => ({ remainingSeconds: 0 })) : Promise.resolve({ remainingSeconds: 0 }),
  ]);
  return (
    <div className="-mx-4 -mt-4 sm:-mx-6 sm:-mt-8 lg:-mx-10 lg:-mt-10">
      <CreativeStudio
        initialPieces={pieces}
        initialVideoGeneration={activeVideoGeneration}
        initialVideoQuotaSeconds={videoQuota.remainingSeconds}
      />
    </div>
  );
}

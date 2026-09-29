export const studioVoices = [
  {
    id: "EXAVITQu4vr4xnSDxMaL",
    name: "Clara",
    note: "Narración clara",
  },
  {
    id: "ErXwobaYiN019PkySvjV",
    name: "Mateo",
    note: "Cercano",
  },
  {
    id: "21m00Tcm4TlvDq8ikWAM",
    name: "Nova",
    note: "Presentación",
  },
  {
    id: "pNInz6obpgDQGcFmaJgB",
    name: "Andrés",
    note: "Grave",
  },
] as const;

export type StudioVoiceId = (typeof studioVoices)[number]["id"];

export function isStudioVoice(value: string): value is StudioVoiceId {
  return studioVoices.some((voice) => voice.id === value);
}

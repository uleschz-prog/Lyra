export function onboardingPath(_user: { role: string; package: string; polygonWallet?: string | null }) {
  // El alta abre /pago al crear la cuenta. Iniciar sesión no debe caer en esa página.
  return null;
}

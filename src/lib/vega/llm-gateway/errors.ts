export class BudgetExceededError extends Error {
  readonly code = "llm_budget";

  constructor(
    readonly remainingUsd: number,
    readonly worstCaseUsd: number,
  ) {
    super("El presupuesto mensual de LLM no alcanza ni para el tier barato.");
    this.name = "BudgetExceededError";
  }
}

export class LlmAuthError extends Error {
  readonly code = "llm_auth";

  constructor() {
    super("El proveedor de modelos rechazó la autenticación.");
    this.name = "LlmAuthError";
  }
}

export class LlmUnavailableError extends Error {
  readonly code = "llm_unavailable";

  constructor(message = "Ningún modelo de la cadena pudo responder.") {
    super(message);
    this.name = "LlmUnavailableError";
  }
}

export class PricingAuthError extends Error {
  readonly code = "pricing_auth";

  constructor() {
    super("El catálogo de precios rechazó la autenticación.");
    this.name = "PricingAuthError";
  }
}

export class PricingCatalogError extends Error {
  readonly code = "pricing_catalog";

  constructor() {
    super("No se pudo leer el catálogo de precios.");
    this.name = "PricingCatalogError";
  }
}

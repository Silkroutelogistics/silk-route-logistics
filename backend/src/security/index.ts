/**
 * Security modules for AI safety and financial validation.
 *
 * Every AI call path should use:
 *   redactSensitiveData → sanitizeForLLM → circuitBreaker.checkLimits → AI API
 *
 * Every financial AI output should pass through:
 *   AI response → validateFinancialDecision → human approval queue
 */

export { redactSensitiveData, redact, redactObject } from "./redactSensitiveData";
export { sanitizeForLLM, sanitizeEmail, sanitizeExternalMessage, sanitizeInternalData } from "./sanitizeForLLM";
export { checkLimits, getCircuitBreakerStatus, resetCircuitBreaker, CircuitBreakerError } from "./circuitBreaker";
export { validateQuickPay, validateInvoice, validateFinancialAmount } from "./validateFinancialDecision";

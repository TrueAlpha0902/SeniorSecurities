export function canonicalizeActivationCode(value: string): string {
  return value.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
}

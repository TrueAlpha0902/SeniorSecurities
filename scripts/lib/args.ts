export function getFlagValue(args: readonly string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  if (index === -1) {
    return undefined;
  }
  return args[index + 1];
}

export function requireFlagValue(args: readonly string[], flag: string): string {
  const value = getFlagValue(args, flag);
  if (value) {
    return value;
  }
  const positional = args.find((arg) => !arg.startsWith("--"));
  if (positional) {
    return positional;
  }
  throw new Error(`Missing required flag: ${flag}`);
}

export function getPositionalArg(args: readonly string[], fallback: string): string {
  const positional = args.find((arg) => !arg.startsWith("--"));
  return positional ?? fallback;
}

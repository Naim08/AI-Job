export function debug(scope: string, ...args: unknown[]) {
  if (process.env.NODE_ENV !== 'production') {
    // eslint-disable-next-line no-console
    console.log(`[${scope}]`, ...args);
  }
} 
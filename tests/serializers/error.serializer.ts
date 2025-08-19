/**
 * Jest Error Snapshot Serializer
 *
 * This serializer ensures Error objects are consistently serialized
 * in snapshots, making them more readable and stable.
 */

export const test = (val: unknown): val is Error => {
  return val instanceof Error;
};

export const serialize = (val: Error): string => {
  const { name, message, stack, ...otherProps } = val;

  // Start with the basic error info
  const lines = [`${name}: ${message}`];

  // Add custom properties if they exist
  if (Object.keys(otherProps).length > 0) {
    lines.push('Properties:');
    Object.entries(otherProps).forEach(([key, value]) => {
      lines.push(`  ${key}: ${JSON.stringify(value)}`);
    });
  }

  // Add a cleaned stack trace (remove absolute paths for consistency)
  if (stack) {
    const cleanStack = stack
      .split('\n')
      .slice(1) // Remove the first line (error message)
      .map(line => line.replace(process.cwd(), '<root>'))
      .map(line => line.replace(/\\/g, '/')) // Normalize path separators
      .slice(0, 5) // Limit stack trace length
      .join('\n');

    if (cleanStack.trim()) {
      lines.push('Stack:');
      lines.push(cleanStack);
    }
  }

  return lines.join('\n');
};

export default { test, serialize };

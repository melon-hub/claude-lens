/**
 * Secret redaction for console logs and context
 *
 * Detects and redacts common secret patterns before
 * sending to Claude to prevent accidental exposure.
 */

const SECRET_PATTERNS: Array<{ name: string; pattern: RegExp }> = [
  // API Keys
  { name: 'OpenAI', pattern: /sk-[a-zA-Z0-9]{20,}/g },
  { name: 'Anthropic', pattern: /sk-ant-[a-zA-Z0-9-]{20,}/g },
  { name: 'GitHub PAT', pattern: /ghp_[a-zA-Z0-9]{36}/g },
  { name: 'GitHub OAuth', pattern: /gho_[a-zA-Z0-9]{36}/g },
  { name: 'AWS Access Key', pattern: /AKIA[0-9A-Z]{16}/g },
  { name: 'AWS Secret', pattern: /[a-zA-Z0-9/+=]{40}(?=.*[A-Z])(?=.*[a-z])(?=.*[0-9])/g },

  // Tokens
  { name: 'JWT', pattern: /eyJ[a-zA-Z0-9_-]*\.eyJ[a-zA-Z0-9_-]*\.[a-zA-Z0-9_-]*/g },
  { name: 'Bearer Token', pattern: /Bearer\s+[a-zA-Z0-9._-]{20,}/gi },

  // Connection Strings
  { name: 'MongoDB', pattern: /mongodb(\+srv)?:\/\/[^:]+:[^@]+@[^\s]+/g },
  { name: 'PostgreSQL', pattern: /postgres(ql)?:\/\/[^:]+:[^@]+@[^\s]+/g },
  { name: 'MySQL', pattern: /mysql:\/\/[^:]+:[^@]+@[^\s]+/g },
  { name: 'Redis', pattern: /redis:\/\/[^:]+:[^@]+@[^\s]+/g },

  // Generic patterns
  {
    name: 'Password assignment',
    pattern: /(password|passwd|pwd|secret|token|api_key|apikey)\s*[:=]\s*['"][^'"]{8,}['"]/gi,
  },
  {
    name: 'Authorization header',
    pattern: /authorization['"]?\s*:\s*['"][^'"]{20,}['"]/gi,
  },

  // Private keys
  { name: 'Private Key', pattern: /-----BEGIN\s+(RSA\s+)?PRIVATE\s+KEY-----[\s\S]*?-----END/g },
];

export interface RedactionResult {
  text: string;
  redactedCount: number;
  redactedTypes: string[];
}

/**
 * Redact secrets from text
 */
export function redactSecrets(text: string): RedactionResult {
  let result = text;
  const redactedTypes: string[] = [];
  let redactedCount = 0;

  for (const { name, pattern } of SECRET_PATTERNS) {
    const matches = result.match(pattern);
    if (matches) {
      redactedCount += matches.length;
      if (!redactedTypes.includes(name)) {
        redactedTypes.push(name);
      }
      result = result.replace(pattern, `[REDACTED:${name}]`);
    }
  }

  return {
    text: result,
    redactedCount,
    redactedTypes,
  };
}

/**
 * Check if text contains secrets (without redacting)
 */
export function containsSecrets(text: string): boolean {
  return SECRET_PATTERNS.some(({ pattern }) => pattern.test(text));
}

/**
 * Add custom secret pattern
 */
export function addSecretPattern(name: string, pattern: RegExp): void {
  SECRET_PATTERNS.push({ name, pattern });
}

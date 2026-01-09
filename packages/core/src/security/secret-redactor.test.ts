import { describe, it, expect } from 'bun:test';
import { redactSecrets, containsSecrets, addSecretPattern } from './secret-redactor.js';

describe('secret-redactor', () => {
  describe('redactSecrets', () => {
    it('should redact OpenAI API keys', () => {
      const text = 'API_KEY=sk-1234567890abcdefghijklmnop';
      const result = redactSecrets(text);

      expect(result.text).toContain('[REDACTED:OpenAI]');
      expect(result.text).not.toContain('sk-1234567890');
      expect(result.redactedCount).toBe(1);
      expect(result.redactedTypes).toContain('OpenAI');
    });

    it('should redact Anthropic API keys', () => {
      const text = 'key: sk-ant-api03-abcdefghijklmnopqrstuvwxyz';
      const result = redactSecrets(text);

      expect(result.text).toContain('[REDACTED:Anthropic]');
      expect(result.redactedCount).toBe(1);
    });

    it('should redact GitHub tokens', () => {
      const text = 'GITHUB_TOKEN=ghp_abcdefghijklmnopqrstuvwxyz1234567890';
      const result = redactSecrets(text);

      expect(result.text).toContain('[REDACTED:GitHub PAT]');
      expect(result.redactedCount).toBe(1);
    });

    it('should redact JWT tokens', () => {
      const text = 'token: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U';
      const result = redactSecrets(text);

      expect(result.text).toContain('[REDACTED:JWT]');
      expect(result.text).not.toContain('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9');
    });

    it('should redact Bearer tokens', () => {
      const text = 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9';
      const result = redactSecrets(text);

      expect(result.text).toContain('[REDACTED');
      expect(result.redactedCount).toBeGreaterThanOrEqual(1);
    });

    it('should redact MongoDB connection strings', () => {
      const text = 'MONGO_URI=mongodb://user:password123@cluster.mongodb.net/db';
      const result = redactSecrets(text);

      expect(result.text).toContain('[REDACTED:MongoDB]');
      expect(result.text).not.toContain('password123');
    });

    it('should redact PostgreSQL connection strings', () => {
      const text = 'DATABASE_URL=postgresql://user:secretpass@localhost:5432/mydb';
      const result = redactSecrets(text);

      expect(result.text).toContain('[REDACTED:PostgreSQL]');
      expect(result.text).not.toContain('secretpass');
    });

    it('should redact password assignments', () => {
      const text = "const password = 'mysupersecretpassword123'";
      const result = redactSecrets(text);

      expect(result.text).toContain('[REDACTED:Password assignment]');
      expect(result.text).not.toContain('mysupersecretpassword123');
    });

    it('should redact AWS access keys', () => {
      const text = 'AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE';
      const result = redactSecrets(text);

      expect(result.text).toContain('[REDACTED:AWS Access Key]');
      expect(result.text).not.toContain('AKIAIOSFODNN7EXAMPLE');
    });

    it('should handle multiple secrets in one text', () => {
      const text = `
        API_KEY=sk-1234567890abcdefghijklmnop
        GITHUB_TOKEN=ghp_abcdefghijklmnopqrstuvwxyz1234567890
      `;
      const result = redactSecrets(text);

      expect(result.redactedCount).toBe(2);
      expect(result.redactedTypes).toContain('OpenAI');
      expect(result.redactedTypes).toContain('GitHub PAT');
    });

    it('should return original text if no secrets', () => {
      const text = 'This is a normal log message without any secrets';
      const result = redactSecrets(text);

      expect(result.text).toBe(text);
      expect(result.redactedCount).toBe(0);
      expect(result.redactedTypes).toHaveLength(0);
    });

    it('should handle empty string', () => {
      const result = redactSecrets('');

      expect(result.text).toBe('');
      expect(result.redactedCount).toBe(0);
    });
  });

  describe('containsSecrets', () => {
    it('should return true if secrets are present', () => {
      expect(containsSecrets('sk-1234567890abcdefghijklmnop')).toBe(true);
      expect(containsSecrets('ghp_abcdefghijklmnopqrstuvwxyz1234567890')).toBe(true);
    });

    it('should return false if no secrets', () => {
      expect(containsSecrets('normal text')).toBe(false);
      expect(containsSecrets('')).toBe(false);
    });
  });

  describe('addSecretPattern', () => {
    it('should add custom patterns', () => {
      const customSecret = 'CUSTOM_12345678901234567890';
      expect(containsSecrets(customSecret)).toBe(false);

      addSecretPattern('Custom', /CUSTOM_[0-9]{20}/g);
      expect(containsSecrets(customSecret)).toBe(true);

      const result = redactSecrets(customSecret);
      expect(result.text).toContain('[REDACTED:Custom]');
    });
  });
});

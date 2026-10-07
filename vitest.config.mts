import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        environment: 'node',
        include: ['tests/**/*.test.ts'],
        testTimeout: 20000, // argon2 es lento a proposito
    },
});
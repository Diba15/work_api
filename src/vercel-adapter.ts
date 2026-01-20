import type { Elysia } from "elysia";

/**
 * Vercel adapter for Elysia
 * This is a no-op adapter since modern Elysia works natively with Vercel
 * when handlers are exported directly (GET, POST, etc.)
 */
export function vercel() {
    return (app: Elysia) => app;
}


# Security Policy

## Supported Versions

Only the latest deployment from the `main` branch is actively supported with security updates.

## Reporting a Vulnerability

If you discover a security vulnerability in **Saans — Urban Air Quality Assistant**, please report it privately before disclosing it publicly:

1. Use **GitHub Private Vulnerability Reporting** on this repository (`Security` -> `Advisories` -> `Report a vulnerability`), or contact the repository maintainer via GitHub.
2. Include reproduction steps, affected endpoint or component, and potential impact.
3. Never include real API keys, tokens, or personal data in public issues or pull requests.

We aim to acknowledge reports within 48 hours and remediate confirmed issues promptly.

## Security Architecture Highlights

- **Server-side Secrets Only**: `GEMINI_API_KEY` is read exclusively by FastAPI from environment variables / `.env` and never bundled into Vite/browser assets or returned in error payloads.
- **No Location or PII Persistence**: Opt-in browser geolocation (`lat`/`lon`) is forwarded ephemerally to Open-Meteo and never logged to server logs or persisted in `localStorage`.
- **Content Security Policy & HTTP Hardening**: Self-hosted fonts, `script-src 'self'`, `style-src 'self'`, `object-src 'none'`, `frame-ancestors 'none'`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, `Permissions-Policy: geolocation=(self)`, `20 KB` request body cap, strict Pydantic schemas (`extra="forbid"`), and proxy-safe sliding-window rate limiting.

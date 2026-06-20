# Site Doctor

Unified local + Cloudflare diagnostics for the portable toolkit.

## Commands

- `site-doctor run --site-profile <profile>`
- `site-doctor diff --site-profile <profile>`

## What it does

`run` executes a broad non-mutating diagnostic pass:

- workstation doctor
- Astro project doctor
- local preview smoke
- live site quality smoke
- live browser diagnostics
- integration doctor
- Cloudflare permissions/site/DNS/public-DNS/rules/email/workers audits
- hardening dry-run

It then writes:

- a combined JSON report
- a combined Markdown summary

## Why it exists

This is the high-level root-cause / triage command meant to reduce guesswork for AI agents and human operators.

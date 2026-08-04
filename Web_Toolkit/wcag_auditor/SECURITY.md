# Security policy

## Supported version

Security fixes are applied to the latest major version.

## Reporting

Report vulnerabilities privately to the project maintainer. Include the affected version, reproduction steps, impact, and a minimal proof of concept. Do not include private application evidence, authentication material, or customer data in a public issue.

## Trust boundaries

- Configuration files and module adapters execute as local code and must be treated as trusted project inputs.
- The command adapter invokes an executable directly with `shell: false`, enforces a timeout, and limits captured output.
- Browser scenarios can access the configured application and inherit the permissions of the test process.
- HTML reports escape finding content and evidence before rendering.
- JSON evidence should not contain secrets. Reports are intended for CI artifacts and may be retained.
- Suppressions are governance records, not a security control.

## Dependency policy

The core intentionally has no runtime package dependencies. Playwright, axe-core integration, and Svelte are optional peer dependencies installed by projects that use those adapters. Keep lockfiles enabled and review peer upgrades before release.

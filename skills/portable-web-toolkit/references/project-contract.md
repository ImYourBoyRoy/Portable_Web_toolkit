# Project contract

## Authority

Apply the host's actual system, administrator, user, repository, and nested
instruction precedence. When operating on a client site, its repository
instructions and approved runbooks govern the work. Toolkit skills and
reference documentation provide subordinate domain procedures.

Do not treat configuration as universal instruction:

- a site profile owns declared deploy targets, hosts, commands, and Cloudflare
  resource identifiers
- a Brand Guide owns approved visual identity and voice
- environment files provide local values and bindings but never override safety
  policy
- manifests and lockfiles own package and runtime state

Resolve contradictory values explicitly. Never transfer one site's profile,
identity, secrets, or deployment contract into another project.

## Management detection

Strong signals:

- repository instructions name Portable Web Toolkit
- package scripts call toolkit CLIs
- a valid site profile matches the active site
- the user explicitly selects the toolkit

Supporting signals:

- `Web_Toolkit` link or directory
- toolkit-generated reports
- known toolkit templates

Require a strong signal or multiple corroborating supporting signals. A stale
or copied directory does not establish authority by itself.

## Generic capability delegation

When management is established, toolkit commands own readiness, site profiles,
Cloudflare sequencing, discovery generation, toolkit-specific headers, site
smoke tests, brand validation, stylesheet checks, and media pipelines.

Generic skills may provide reasoning and safety contracts but must not create
parallel commands, profiles, generators, or release gates.

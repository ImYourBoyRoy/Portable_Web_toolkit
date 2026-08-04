export class ToolkitError extends Error {
  constructor(message, options = {}) {
    super(message, { cause: options.cause });
    this.name = 'ToolkitError';
    this.code = options.code ?? 'TOOLKIT_ERROR';
    this.details = options.details;
  }
}

export class ConfigError extends ToolkitError {
  constructor(message, details, cause) {
    super(message, { code: 'INVALID_CONFIG', details, cause });
    this.name = 'ConfigError';
  }
}

export class AdapterError extends ToolkitError {
  constructor(message, details, cause) {
    super(message, { code: 'ADAPTER_ERROR', details, cause });
    this.name = 'AdapterError';
  }
}

export class DependencyError extends ToolkitError {
  constructor(message, details, cause) {
    super(message, { code: 'MISSING_DEPENDENCY', details, cause });
    this.name = 'DependencyError';
  }
}

export class ReporterError extends ToolkitError {
  constructor(message, details, cause) {
    super(message, { code: 'REPORTER_ERROR', details, cause });
    this.name = 'ReporterError';
  }
}

type LogLevel = 'info' | 'warn' | 'error' | 'debug'

const colors: Record<LogLevel, string> = {
  info: '\x1b[36m',
  warn: '\x1b[33m',
  error: '\x1b[31m',
  debug: '\x1b[90m',
}

const reset = '\x1b[0m'

function format(level: LogLevel, message: string, meta?: Record<string, unknown>): string {
  const timestamp = new Date().toISOString()
  const color = colors[level]
  const base = `${color}[${level.toUpperCase()}]${reset} ${timestamp} ${message}`
  if (meta) {
    return `${base} ${JSON.stringify(meta)}`
  }
  return base
}

export const logger = {
  info: (message: string, meta?: Record<string, unknown>) => console.log(format('info', message, meta)),
  warn: (message: string, meta?: Record<string, unknown>) => console.warn(format('warn', message, meta)),
  error: (message: string, meta?: Record<string, unknown>) => console.error(format('error', message, meta)),
  debug: (message: string, meta?: Record<string, unknown>) => console.debug(format('debug', message, meta)),
}

import { z } from 'zod'

const envSchema = z.object({
  PORT: z.coerce.number().default(3000),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  JWT_SECRET: z.string().min(16, 'JWT_SECRET must be at least 16 characters long'),
  JWT_EXPIRES_IN: z.string().default('7d'),
  FRONTEND_URL: z.string().default('http://localhost:3001'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  // Opcionales para no tumbar el arranque de despliegues existentes: el
  // endpoint interno y el sender fallan cerrados si no están configurados.
  EMAIL_SERVICE_URL: z.string().url().optional(),
  EMAIL_SERVICE_API_KEY: z.string().min(1).optional(),
  CRON_SECRET: z.string().min(1).optional(),
})

const parsed = envSchema.safeParse(process.env)

if (!parsed.success) {
  console.error('Environment validation failed:')
  for (const issue of parsed.error.issues) {
    console.error(`  - ${issue.path.join('.')}: ${issue.message}`)
  }
  process.exit(1)
}

export const config = {
  port: parsed.data.PORT,
  databaseUrl: parsed.data.DATABASE_URL,
  jwtSecret: parsed.data.JWT_SECRET,
  jwtExpiresIn: parsed.data.JWT_EXPIRES_IN,
  frontendUrl: parsed.data.FRONTEND_URL,
  nodeEnv: parsed.data.NODE_ENV,
  emailServiceUrl: parsed.data.EMAIL_SERVICE_URL,
  emailServiceApiKey: parsed.data.EMAIL_SERVICE_API_KEY,
  cronSecret: parsed.data.CRON_SECRET,
}

export const config = {
  port: process.env.PORT ? parseInt(process.env.PORT, 10) : 3000,
  databaseUrl: process.env.DATABASE_URL || '',
  jwtSecret: process.env.JWT_SECRET || 'change-me-in-production',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
}

if (!config.databaseUrl) {
  throw new Error('DATABASE_URL is required')
}

if (!config.jwtSecret || config.jwtSecret === 'change-me-in-production') {
  console.warn('WARNING: Using default JWT_SECRET. Set a secure value in production.')
}

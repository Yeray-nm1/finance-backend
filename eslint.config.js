export default [
  {
    ignores: ['dist/', 'node_modules/', 'prisma/'],
  },
  {
    rules: {
      'no-unused-vars': 'warn',
      'no-console': 'off',
      'prefer-const': 'error',
    },
  },
]

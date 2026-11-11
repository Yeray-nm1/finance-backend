## [1.4.0] - 2026-11-11

- 2784b01 Merge pull request #18 from Yeray-nm1/feat/mvp-budgets-csv-accounts-categories
- 915eb95 feat(transfers): guardar la cuenta destino y calcular el ahorro por origen/destino
- f032f5c ci: ejecutar lint en el pipeline
- 2401a90 fix: validar importes, fechas y categorías en la API
- 3f596e1 feat(transactions): filtrar por flujo de movimiento
- 3452554 chore: eliminar la configuración ESLint antigua
- 099aeab chore: versionar migraciones y configurar ESLint
- 2c8b637 feat(auth): permitir cambiar la contraseña desde la app
- b7343e9 feat: add subscription status and bulk transaction updates
- b944472 feat(dashboard): add category spending and monthly evolution
- 9defdf4 feat(transfers): distinguish internal and external transfers
- e175bbf feat(categories): validate names and filter uncategorized transactions
- 5cf01dd chore: remove unused keyword categorization
- a887c6d feat(accounts): create default account and assign transactions
- c1aee8b feat(transactions): add CSV preview and column mapping
- 2d5a22d feat(budgets): allocate monthly budget per category
- f3d9070 feat(budgets): add endpoint to list months with budget

## [1.3.4] - 2026-10-29

- 7c6e8be Merge pull request #17 from Yeray-nm1/fix/csv-import-spanish-format
- ce83be6 fix(csv): parse Spanish amounts and dates correctly

## [1.3.3] - 2026-10-29

- 7bd2275 Merge pull request #16 from Yeray-nm1/fix/auth-rate-limit-failed-attempts
- d7f6040 fix: only failed auth attempts should count against rate limit

## [1.3.2] - 2026-06-01

- d66cd89 Merge pull request #15 from Yeray-nm1/feature/ynm-14-auth-restrigir-rate-limiter-a-solo-loginregister
- ae1186b fixed limiter when auth
- 0359e96 #14 Update project version for feature branch

## [1.3.1] - 2026-06-01

- 719c57d Merge pull request #13 from Yeray-nm1/feature/ynm-12-extend-dashboard-api-to-return-categorytype-in-bud
- 39d36c5 extended dashboard api
- 927c352 #12 Update project version for feature branch

## [1.3.0] - 2026-05-27

- 427ffac Merge pull request #11 from Yeray-nm1/feature/ynm-10-aadir-campo-issubscription-al-modelo-transaction
- 0db743e #10 Add subscriptionIds filter to transactions API
- b403b63 #10 Update project version for feature branch

## [1.2.0] - 2026-05-24

- bb3bffb Merge pull request #9 from Yeray-nm1/feature/ynm-6-sistema-de-suscripciones-v2--modelo-de-datos-y-end
- f1bc68f feat: subscription management v2 - create/edit/autodetect with refactored data structures

## [1.1.0] - 2026-05-22

- d0755e4 Merge pull request #8 from Yeray-nm1/feature/ynm-7-add-release-workflow
- 14123a3 #7 Add release workflow caller
- 77b995c #7 Update project version for feature branch
- 49628a5 Merge pull request #5 from Yeray-nm1/feature/ynm-4-transaction-pagination-filtering-edition
- b2392ee refactor: remove auto-categorization from transaction service
- 601119f added: pagination, filtering, order and transaction edition
- 469f86e #4 Update project version for feature branch
- 65b40b1 Merge pull request #3 from Yeray-nm1/feature/ynm-2-calculate-income-button
- 1c0f0c1 added endpoint to manage monthly budget
- 42c63cc Merge pull request #2 from Yeray-nm1/feature/ynm-1-refactor-monthly-budget
- 9eddf08 code quality cleanup: helmet, rate limit, zod env validation, password policy, Prisma migration (source field), remove any types, pagination, REST convention, dead code, seed
- 8586659 fix: add prisma generate to build script and fix implicit any types
- efe21ce fix: add pnpm-lock.yaml to version control for CI
- f1692b4 alignment with frontend budget workflow
- 270f6bd added cookies based auth
- 700f5f9 first approach


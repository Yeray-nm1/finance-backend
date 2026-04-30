# finance-backend

Personal finance backend con Express, Prisma y PostgreSQL.

## Stack

- Node.js + TypeScript
- Express 5
- Prisma 7 + PostgreSQL
- JWT + bcrypt para auth

## Setup

```bash
# Instalar dependencias
pnpm install

# Configurar variables de entorno
cp .env.example .env
# Edita .env con tu DATABASE_URL

# Generar cliente de Prisma
pnpm prisma generate

# Crear las tablas en la base de datos
pnpm prisma migrate dev
```

## Scripts

```bash
pnpm dev          # Dev server con hot reload
pnpm build        # Compilar a dist/
pnpm start        # Production server
```

## Variables de entorno

```
DATABASE_URL=postgresql://user:password@localhost:5432/finance
PORT=3000
JWT_SECRET=tu-secreto-aqui
JWT_EXPIRES_IN=7d
```

## Estructura de API

### Auth (sin auth requerida)
- `POST /api/v1/auth/register` — `{ email, password }`
- `POST /api/v1/auth/login` — `{ email, password }` → `{ user, token }`

### Accounts
- `GET /api/v1/accounts` — Lista cuentas
- `GET /api/v1/accounts/:id` — Detalle
- `POST /api/v1/accounts` — Crear `{ name, type }`
- `PUT /api/v1/accounts/:id` — Actualizar
- `DELETE /api/v1/accounts/:id` — Eliminar

### Categories
- `GET /api/v1/categories` — Lista categorías
- `POST /api/v1/categories` — Crear `{ name, type }` (needs, leisure, savings, other)
- `PUT /api/v1/categories/:id` — Actualizar
- `DELETE /api/v1/categories/:id` — Eliminar

### Transactions
- `GET /api/v1/transactions` — Todas las transacciones
- `POST /api/v1/transactions` — Crear `{ date, amount, description, type, accountId?, categoryId? }`
- `POST /api/v1/transactions/import` — Importar CSV parseado `{ rows: [...] }`

### Budgets
- `GET /api/v1/budgets` — Lista presupuestos con categoría
- `POST /api/v1/budgets` — Crear `{ categoryId, percentage }` (0-100)
- `PUT /api/v1/budgets/:id` — Actualizar
- `DELETE /api/v1/budgets/:id` — Eliminar

### Subscriptions
- `GET /api/v1/subscriptions` — Lista suscripciones
- `POST /api/v1/subscriptions` — Crear manualmente `{ name, amount, frequency }`
- `GET /api/v1/subscriptions/detect` — Detectar candidatos sin guardar
- `POST /api/v1/subscriptions/detect` — Auto-detectar y guardar desde transacciones

### Dashboard
- `GET /api/v1/dashboard?year=2026&month=4` — Calcula todo en tiempo real:
  - Balance del mes (income, expenses, savings, available, balance)
  - Desviaciones de presupuestos por categoría
  - Suscripciones recurrentes (manuales + detectadas)
  - Transacciones recientes

## Autenticación

Todos los endpoints excepto `/auth/register` y `/auth/login` requieren header:
```
Authorization: Bearer <token>
```

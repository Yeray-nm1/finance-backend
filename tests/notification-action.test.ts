import { beforeEach, describe, expect, it, vi } from 'vitest'

// El CI ejecuta `pnpm test` antes de generar el cliente de Prisma. Este test
// solo necesita el tipo de error para el código que no se ejecuta aquí.
vi.mock('@prisma/client', () => ({
  Prisma: {
    PrismaClientKnownRequestError: class PrismaClientKnownRequestError extends Error {},
  },
}))

vi.mock('../src/core/db', () => ({
  prisma: {
    notification: {
      createMany: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      updateMany: vi.fn(),
    },
  },
}))

import { prisma } from '../src/core/db'
import { NotificationRepository } from '../src/modules/notifications/notifications.repository'

const db = vi.mocked(prisma.notification)

beforeEach(() => {
  vi.clearAllMocks()
})

describe('acción de las notificaciones in-app', () => {
  it('FIX-2 guarda el actionUrl al crear el aviso', async () => {
    db.findMany.mockResolvedValue([] as never)
    db.createMany.mockResolvedValue({ count: 1 } as never)
    const actionUrl = '/goals/aceptar?token=token-de-la-campana'

    await NotificationRepository.createNotifications('u1', [
      {
        key: 'goal_contribution:g1:2026-11',
        type: 'goal_contribution',
        title: 'Aportación programada: Viaje a Japón',
        body: 'Pendiente de confirmar',
        actionUrl,
      },
    ])

    expect(db.createMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({ actionUrl })],
      skipDuplicates: true,
    })
  })

  it('FIX-2 devuelve el actionUrl al listar', async () => {
    db.findMany.mockResolvedValue([
      {
        id: 'n1',
        type: 'goal_contribution',
        title: 'Aportación programada: Viaje a Japón',
        body: 'Pendiente de confirmar',
        createdAt: new Date('2026-11-18T12:00:00.000Z'),
        readAt: null,
        actionUrl: '/goals/aceptar?token=guardado',
      },
    ] as never)

    const items = await NotificationRepository.list('u1')

    expect(items[0]?.actionUrl).toBe('/goals/aceptar?token=guardado')
  })

  it('FIX-2 recompone la acción de avisos antiguos que no guardaron actionUrl', async () => {
    db.findMany.mockResolvedValue([
      {
        id: 'n1',
        key: 'goal_contribution:g1:2026-11',
        type: 'goal_contribution',
        title: 'Aportación programada: Viaje a Japón',
        body: 'Pendiente de confirmar',
        createdAt: new Date('2026-11-18T12:00:00.000Z'),
        readAt: null,
        actionUrl: null,
      },
    ] as never)

    const items = await NotificationRepository.list('u1')

    expect(items[0]?.actionUrl).toMatch(/^\/goals\/aceptar\?token=/)
  })
})

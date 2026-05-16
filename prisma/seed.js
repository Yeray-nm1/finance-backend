"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const bcrypt_1 = __importDefault(require("bcrypt"));
const prisma = new client_1.PrismaClient();
async function main() {
    const email = 'demo@example.com';
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
        console.log('Seed user already exists, skipping.');
        return;
    }
    const hashed = await bcrypt_1.default.hash('Demo1234', 10);
    const user = await prisma.user.create({
        data: {
            email,
            password: hashed,
            accounts: {
                create: [
                    { name: 'Cuenta Principal', type: 'checking' },
                    { name: 'Ahorros', type: 'savings' },
                ],
            },
            categories: {
                create: [
                    { name: 'Nómina', type: 'needs' },
                    { name: 'Hipoteca', type: 'needs' },
                    { name: 'Supermercado', type: 'needs' },
                    { name: 'Restaurante', type: 'leisure' },
                    { name: 'Ocio', type: 'leisure' },
                    { name: 'Ahorro', type: 'savings' },
                ],
            },
        },
    });
    console.log(`Seed complete: ${user.email}`);
}
main()
    .catch((e) => {
    console.error('Seed error:', e);
    process.exit(1);
})
    .finally(() => prisma.$disconnect());

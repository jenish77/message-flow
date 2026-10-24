import { prisma } from '../src/db/prisma';

export async function clearDatabase(): Promise<void> {
  // Clear dependent tables first
  await prisma.providerEvent.deleteMany({});
  await prisma.message.deleteMany({});
}

export async function disconnectDatabase(): Promise<void> {
  await prisma.$disconnect();
}

-- CreateTable
CREATE TABLE "Kingdom" (
    "id" SERIAL NOT NULL,
    "kdNumber" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "project" TEXT,
    "seed" TEXT NOT NULL,
    "powerReq" BIGINT NOT NULL,
    "kpReq" BIGINT NOT NULL,
    "kvkWins" INTEGER NOT NULL DEFAULT 0,
    "kvkLosses" INTEGER NOT NULL DEFAULT 0,
    "ownerId" TEXT NOT NULL,
    "description" TEXT,
    "isPaid" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Kingdom_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Ticket" (
    "id" SERIAL NOT NULL,
    "channelId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kingdomId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closed" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Ticket_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Kingdom_kdNumber_key" ON "Kingdom"("kdNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Ticket_channelId_key" ON "Ticket"("channelId");

-- AddForeignKey
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_kingdomId_fkey" FOREIGN KEY ("kingdomId") REFERENCES "Kingdom"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

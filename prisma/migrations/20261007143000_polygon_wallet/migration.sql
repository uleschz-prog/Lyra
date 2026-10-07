ALTER TABLE "User" ADD COLUMN "polygonWallet" TEXT;

CREATE UNIQUE INDEX "User_polygonWallet_key" ON "User"("polygonWallet");

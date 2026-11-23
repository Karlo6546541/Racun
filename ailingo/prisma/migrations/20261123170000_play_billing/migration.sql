-- AlterTable
ALTER TABLE "Subscription" ADD COLUMN     "playProductId" TEXT,
ADD COLUMN     "playPurchaseToken" TEXT,
ADD COLUMN     "provider" TEXT NOT NULL DEFAULT 'stripe',
ALTER COLUMN "stripeCustomerId" DROP NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_playPurchaseToken_key" ON "Subscription"("playPurchaseToken");


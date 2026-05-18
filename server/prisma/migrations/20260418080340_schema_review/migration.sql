-- Applies the schema review changes to the production-tracking model.
-- Removes legacy columns and aligns tables with the current Prisma schema.
-- Updates constraints required by soft deletion and traceability workflows.

/*
  Warnings:

  - You are about to drop the column `location` on the `Machine` table. All the data in the column will be lost.
  - You are about to drop the column `percentageUsed` on the `MaterialUsage` table. All the data in the column will be lost.
  - You are about to drop the column `badge` on the `Operator` table. All the data in the column will be lost.
  - You are about to drop the column `createdAt` on the `Operator` table. All the data in the column will be lost.
  - You are about to drop the column `sku` on the `Product` table. All the data in the column will be lost.
  - You are about to drop the column `createdAt` on the `ProductionRun` table. All the data in the column will be lost.
  - You are about to drop the column `createdAt` on the `Recipe` table. All the data in the column will be lost.
  - You are about to drop the column `rollCount` on the `RunOutput` table. All the data in the column will be lost.
  - You are about to drop the column `rollSpec` on the `RunOutput` table. All the data in the column will be lost.
  - You are about to drop the column `extruder` on the `RunParameterValue` table. All the data in the column will be lost.
  - You are about to drop the column `side` on the `RunParameterValue` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[machineId,displayOrder]` on the table `MachineParameter` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[code]` on the table `Product` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[productionRunId,machineParameterId]` on the table `RunParameterValue` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `code` to the `Product` table without a default value. This is not possible if the table is not empty.
  - Made the column `recipeId` on table `ProductionRun` required. This step will fail if there are existing NULL values in that column.

*/
-- DropForeignKey
ALTER TABLE "ProductionRun" DROP CONSTRAINT "ProductionRun_recipeId_fkey";

-- DropIndex
DROP INDEX "Operator_badge_key";

-- DropIndex
DROP INDEX "Product_sku_key";

-- DropIndex
DROP INDEX "RunParameterValue_productionRunId_machineParameterId_extrud_key";

-- AlterTable
ALTER TABLE "Machine" DROP COLUMN "location",
ALTER COLUMN "code" DROP NOT NULL;

-- AlterTable
ALTER TABLE "Material" ADD COLUMN     "supplier" TEXT;

-- AlterTable
ALTER TABLE "MaterialUsage" DROP COLUMN "percentageUsed";

-- AlterTable
ALTER TABLE "Operator" DROP COLUMN "badge",
DROP COLUMN "createdAt";

-- AlterTable
ALTER TABLE "Product" DROP COLUMN "sku",
ADD COLUMN     "code" TEXT NOT NULL,
ADD COLUMN     "description" TEXT;

-- AlterTable
ALTER TABLE "ProductionRun" DROP COLUMN "createdAt",
ADD COLUMN     "potentialBuyer" TEXT,
ALTER COLUMN "recipeId" SET NOT NULL;

-- AlterTable
ALTER TABLE "Recipe" DROP COLUMN "createdAt";

-- AlterTable
ALTER TABLE "RunOutput" DROP COLUMN "rollCount",
DROP COLUMN "rollSpec";

-- AlterTable
ALTER TABLE "RunParameterValue" DROP COLUMN "extruder",
DROP COLUMN "side";

-- CreateIndex
CREATE UNIQUE INDEX "MachineParameter_machineId_displayOrder_key" ON "MachineParameter"("machineId", "displayOrder");

-- CreateIndex
CREATE UNIQUE INDEX "Product_code_key" ON "Product"("code");

-- CreateIndex
CREATE UNIQUE INDEX "RunParameterValue_productionRunId_machineParameterId_key" ON "RunParameterValue"("productionRunId", "machineParameterId");

-- AddForeignKey
ALTER TABLE "ProductionRun" ADD CONSTRAINT "ProductionRun_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "Recipe"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

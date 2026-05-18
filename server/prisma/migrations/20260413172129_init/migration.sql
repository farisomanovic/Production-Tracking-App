-- Initializes the Production Tracker relational schema.
-- Creates master, configuration, and transactional tables.
-- Establishes indexes and foreign keys for Prisma-managed PostgreSQL data.

-- CreateTable
CREATE TABLE "Operator" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "badge" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Operator_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Machine" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Machine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Parameter" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "unit" TEXT,
    "description" TEXT,

    CONSTRAINT "Parameter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MachineParameter" (
    "id" TEXT NOT NULL,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "machineId" TEXT NOT NULL,
    "parameterId" TEXT NOT NULL,

    CONSTRAINT "MachineParameter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "widthMm" DOUBLE PRECISION,
    "thicknessMm" DOUBLE PRECISION,
    "lengthM" DOUBLE PRECISION,
    "unit" TEXT NOT NULL,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MachineProduct" (
    "id" TEXT NOT NULL,
    "machineId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,

    CONSTRAINT "MachineProduct_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Material" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "stockQty" DOUBLE PRECISION NOT NULL DEFAULT 0,

    CONSTRAINT "Material_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Recipe" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "productId" TEXT NOT NULL,

    CONSTRAINT "Recipe_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecipeItem" (
    "id" TEXT NOT NULL,
    "percentage" DOUBLE PRECISION NOT NULL,
    "plannedQtyKg" DOUBLE PRECISION,
    "recipeId" TEXT NOT NULL,
    "materialId" TEXT NOT NULL,

    CONSTRAINT "RecipeItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductionRun" (
    "id" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "startTime" TIMESTAMP(3) NOT NULL,
    "endTime" TIMESTAMP(3),
    "warmupStartTime" TIMESTAMP(3),
    "stableStartTime" TIMESTAMP(3),
    "energyStart" DOUBLE PRECISION,
    "energyEnd" DOUBLE PRECISION,
    "notes" TEXT,
    "status" TEXT NOT NULL DEFAULT 'in_progress',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "operatorId" TEXT NOT NULL,
    "machineId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "recipeId" TEXT,

    CONSTRAINT "ProductionRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RunParameterValue" (
    "id" TEXT NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "extruder" TEXT,
    "side" TEXT,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "productionRunId" TEXT NOT NULL,
    "machineParameterId" TEXT NOT NULL,

    CONSTRAINT "RunParameterValue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MaterialUsage" (
    "id" TEXT NOT NULL,
    "quantityUsed" DOUBLE PRECISION NOT NULL,
    "percentageUsed" DOUBLE PRECISION,
    "productionRunId" TEXT NOT NULL,
    "materialId" TEXT NOT NULL,

    CONSTRAINT "MaterialUsage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RunOutput" (
    "id" TEXT NOT NULL,
    "quantityProduced" DOUBLE PRECISION NOT NULL,
    "rollCount" INTEGER,
    "grossWeightKg" DOUBLE PRECISION,
    "scrapKg" DOUBLE PRECISION,
    "rollSpec" TEXT,
    "productionRunId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,

    CONSTRAINT "RunOutput_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Operator_badge_key" ON "Operator"("badge");

-- CreateIndex
CREATE UNIQUE INDEX "Machine_code_key" ON "Machine"("code");

-- CreateIndex
CREATE UNIQUE INDEX "MachineParameter_machineId_parameterId_key" ON "MachineParameter"("machineId", "parameterId");

-- CreateIndex
CREATE UNIQUE INDEX "Product_sku_key" ON "Product"("sku");

-- CreateIndex
CREATE UNIQUE INDEX "MachineProduct_machineId_productId_key" ON "MachineProduct"("machineId", "productId");

-- CreateIndex
CREATE UNIQUE INDEX "RecipeItem_recipeId_materialId_key" ON "RecipeItem"("recipeId", "materialId");

-- CreateIndex
CREATE UNIQUE INDEX "RunParameterValue_productionRunId_machineParameterId_extrud_key" ON "RunParameterValue"("productionRunId", "machineParameterId", "extruder", "side");

-- CreateIndex
CREATE UNIQUE INDEX "MaterialUsage_productionRunId_materialId_key" ON "MaterialUsage"("productionRunId", "materialId");

-- AddForeignKey
ALTER TABLE "MachineParameter" ADD CONSTRAINT "MachineParameter_machineId_fkey" FOREIGN KEY ("machineId") REFERENCES "Machine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MachineParameter" ADD CONSTRAINT "MachineParameter_parameterId_fkey" FOREIGN KEY ("parameterId") REFERENCES "Parameter"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MachineProduct" ADD CONSTRAINT "MachineProduct_machineId_fkey" FOREIGN KEY ("machineId") REFERENCES "Machine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MachineProduct" ADD CONSTRAINT "MachineProduct_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Recipe" ADD CONSTRAINT "Recipe_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecipeItem" ADD CONSTRAINT "RecipeItem_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "Recipe"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecipeItem" ADD CONSTRAINT "RecipeItem_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionRun" ADD CONSTRAINT "ProductionRun_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "Operator"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionRun" ADD CONSTRAINT "ProductionRun_machineId_fkey" FOREIGN KEY ("machineId") REFERENCES "Machine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionRun" ADD CONSTRAINT "ProductionRun_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionRun" ADD CONSTRAINT "ProductionRun_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "Recipe"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RunParameterValue" ADD CONSTRAINT "RunParameterValue_productionRunId_fkey" FOREIGN KEY ("productionRunId") REFERENCES "ProductionRun"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RunParameterValue" ADD CONSTRAINT "RunParameterValue_machineParameterId_fkey" FOREIGN KEY ("machineParameterId") REFERENCES "MachineParameter"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialUsage" ADD CONSTRAINT "MaterialUsage_productionRunId_fkey" FOREIGN KEY ("productionRunId") REFERENCES "ProductionRun"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialUsage" ADD CONSTRAINT "MaterialUsage_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RunOutput" ADD CONSTRAINT "RunOutput_productionRunId_fkey" FOREIGN KEY ("productionRunId") REFERENCES "ProductionRun"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RunOutput" ADD CONSTRAINT "RunOutput_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

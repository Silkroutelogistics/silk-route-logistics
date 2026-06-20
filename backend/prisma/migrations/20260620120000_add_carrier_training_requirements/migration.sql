-- v3.8.aoa — Driver Academy Sprint D: carrier-wide required-course set.
-- Additive: one new table, no changes to existing tables. Safe to apply on a
-- live DB. Compliance/overdue are computed (joined against driver_course_progress),
-- not stored here.

CREATE TABLE "public"."carrier_training_requirements" (
    "id" TEXT NOT NULL,
    "carrierProfileId" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "dueDays" INTEGER NOT NULL DEFAULT 30,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "carrier_training_requirements_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "carrier_training_requirements_carrierProfileId_courseId_key"
    ON "public"."carrier_training_requirements"("carrierProfileId", "courseId");

CREATE INDEX "carrier_training_requirements_carrierProfileId_idx"
    ON "public"."carrier_training_requirements"("carrierProfileId");

ALTER TABLE "public"."carrier_training_requirements"
    ADD CONSTRAINT "carrier_training_requirements_carrierProfileId_fkey"
    FOREIGN KEY ("carrierProfileId") REFERENCES "public"."carrier_profiles"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "public"."carrier_training_requirements"
    ADD CONSTRAINT "carrier_training_requirements_courseId_fkey"
    FOREIGN KEY ("courseId") REFERENCES "public"."training_courses"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

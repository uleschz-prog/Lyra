CREATE TYPE "AcademyCourseStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');
CREATE TYPE "AcademyPricingType" AS ENUM ('FREE', 'ONE_TIME', 'MONTHLY');
CREATE TYPE "AcademyEnrollmentStatus" AS ENUM ('ACTIVE', 'EXPIRED', 'CANCELLED');
CREATE TYPE "AcademyPaymentStatus" AS ENUM ('CREATED', 'PENDING', 'APPROVED', 'REJECTED', 'CANCELLED', 'REFUNDED');

ALTER TABLE "Course"
    ADD COLUMN "creatorId" TEXT,
    ADD COLUMN "slug" TEXT,
    ADD COLUMN "coverImageUrl" TEXT,
    ADD COLUMN "price" DECIMAL(12,2) NOT NULL DEFAULT 0,
    ADD COLUMN "currency" TEXT NOT NULL DEFAULT 'MXN',
    ADD COLUMN "pricingType" "AcademyPricingType" NOT NULL DEFAULT 'FREE',
    ADD COLUMN "status" "AcademyCourseStatus" NOT NULL DEFAULT 'DRAFT',
    ADD COLUMN "publishedAt" TIMESTAMP(3),
    ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE "Lesson"
    ADD COLUMN "moduleId" TEXT,
    ADD COLUMN "content" TEXT,
    ADD COLUMN "durationSeconds" INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN "isPreview" BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN "isPublished" BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE TABLE "CreatorAccount" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'mercadopago',
    "sellerId" TEXT NOT NULL,
    "siteId" TEXT,
    "accessTokenEncrypted" TEXT NOT NULL,
    "refreshTokenEncrypted" TEXT,
    "tokenExpiresAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'connected',
    "connectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CreatorAccount_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AcademyOAuthState" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "stateHash" TEXT NOT NULL,
    "codeVerifierEncrypted" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AcademyOAuthState_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CourseModule" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CourseModule_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AcademyTransaction" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "buyerId" TEXT NOT NULL,
    "creatorId" TEXT NOT NULL,
    "creatorAccountId" TEXT NOT NULL,
    "externalReference" TEXT NOT NULL,
    "gatewayPreferenceId" TEXT,
    "gatewayPaymentId" TEXT,
    "totalAmount" DECIMAL(12,2) NOT NULL,
    "lyraFee7Percent" DECIMAL(12,2) NOT NULL,
    "creatorPayout93Percent" DECIMAL(12,2) NOT NULL,
    "gatewayFee" DECIMAL(12,2),
    "currency" TEXT NOT NULL,
    "feeRate" DECIMAL(5,4) NOT NULL DEFAULT 0.07,
    "paymentGateway" TEXT NOT NULL DEFAULT 'mercadopago',
    "paymentGatewayStatus" "AcademyPaymentStatus" NOT NULL DEFAULT 'CREATED',
    "gatewayStatusDetail" TEXT,
    "checkoutUrl" TEXT,
    "paidAt" TIMESTAMP(3),
    "refundedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AcademyTransaction_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CourseEnrollment" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "status" "AcademyEnrollmentStatus" NOT NULL DEFAULT 'ACTIVE',
    "enrolledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    "purchaseTransactionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CourseEnrollment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "LessonProgress" (
    "id" TEXT NOT NULL,
    "enrollmentId" TEXT NOT NULL,
    "lessonId" TEXT NOT NULL,
    "completedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "LessonProgress_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "LessonAttachment" (
    "id" TEXT NOT NULL,
    "lessonId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "mimeType" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LessonAttachment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "LessonComment" (
    "id" TEXT NOT NULL,
    "lessonId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "LessonComment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Course_slug_key" ON "Course"("slug");
CREATE INDEX "Course_creatorId_status_updatedAt_idx" ON "Course"("creatorId", "status", "updatedAt");
CREATE INDEX "Course_status_publishedAt_idx" ON "Course"("status", "publishedAt");
CREATE INDEX "Lesson_moduleId_position_idx" ON "Lesson"("moduleId", "position");
CREATE UNIQUE INDEX "CreatorAccount_userId_key" ON "CreatorAccount"("userId");
CREATE INDEX "CreatorAccount_status_idx" ON "CreatorAccount"("status");
CREATE UNIQUE INDEX "AcademyOAuthState_stateHash_key" ON "AcademyOAuthState"("stateHash");
CREATE INDEX "AcademyOAuthState_userId_expiresAt_idx" ON "AcademyOAuthState"("userId", "expiresAt");
CREATE INDEX "CourseModule_courseId_position_idx" ON "CourseModule"("courseId", "position");
CREATE UNIQUE INDEX "AcademyTransaction_externalReference_key" ON "AcademyTransaction"("externalReference");
CREATE UNIQUE INDEX "AcademyTransaction_gatewayPreferenceId_key" ON "AcademyTransaction"("gatewayPreferenceId");
CREATE UNIQUE INDEX "AcademyTransaction_gatewayPaymentId_key" ON "AcademyTransaction"("gatewayPaymentId");
CREATE INDEX "AcademyTransaction_courseId_paymentGatewayStatus_createdAt_idx" ON "AcademyTransaction"("courseId", "paymentGatewayStatus", "createdAt");
CREATE INDEX "AcademyTransaction_creatorId_paymentGatewayStatus_paidAt_idx" ON "AcademyTransaction"("creatorId", "paymentGatewayStatus", "paidAt");
CREATE INDEX "AcademyTransaction_buyerId_paymentGatewayStatus_createdAt_idx" ON "AcademyTransaction"("buyerId", "paymentGatewayStatus", "createdAt");
CREATE UNIQUE INDEX "CourseEnrollment_purchaseTransactionId_key" ON "CourseEnrollment"("purchaseTransactionId");
CREATE UNIQUE INDEX "CourseEnrollment_courseId_studentId_key" ON "CourseEnrollment"("courseId", "studentId");
CREATE INDEX "CourseEnrollment_studentId_status_updatedAt_idx" ON "CourseEnrollment"("studentId", "status", "updatedAt");
CREATE INDEX "CourseEnrollment_courseId_status_idx" ON "CourseEnrollment"("courseId", "status");
CREATE UNIQUE INDEX "LessonProgress_enrollmentId_lessonId_key" ON "LessonProgress"("enrollmentId", "lessonId");
CREATE INDEX "LessonProgress_lessonId_idx" ON "LessonProgress"("lessonId");
CREATE INDEX "LessonAttachment_lessonId_position_idx" ON "LessonAttachment"("lessonId", "position");
CREATE INDEX "LessonComment_lessonId_createdAt_idx" ON "LessonComment"("lessonId", "createdAt");

ALTER TABLE "Course" ADD CONSTRAINT "Course_creatorId_fkey"
    FOREIGN KEY ("creatorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Lesson" ADD CONSTRAINT "Lesson_moduleId_fkey"
    FOREIGN KEY ("moduleId") REFERENCES "CourseModule"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CreatorAccount" ADD CONSTRAINT "CreatorAccount_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AcademyOAuthState" ADD CONSTRAINT "AcademyOAuthState_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CourseModule" ADD CONSTRAINT "CourseModule_courseId_fkey"
    FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AcademyTransaction" ADD CONSTRAINT "AcademyTransaction_courseId_fkey"
    FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AcademyTransaction" ADD CONSTRAINT "AcademyTransaction_buyerId_fkey"
    FOREIGN KEY ("buyerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AcademyTransaction" ADD CONSTRAINT "AcademyTransaction_creatorId_fkey"
    FOREIGN KEY ("creatorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AcademyTransaction" ADD CONSTRAINT "AcademyTransaction_creatorAccountId_fkey"
    FOREIGN KEY ("creatorAccountId") REFERENCES "CreatorAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CourseEnrollment" ADD CONSTRAINT "CourseEnrollment_courseId_fkey"
    FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CourseEnrollment" ADD CONSTRAINT "CourseEnrollment_studentId_fkey"
    FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CourseEnrollment" ADD CONSTRAINT "CourseEnrollment_purchaseTransactionId_fkey"
    FOREIGN KEY ("purchaseTransactionId") REFERENCES "AcademyTransaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "LessonProgress" ADD CONSTRAINT "LessonProgress_enrollmentId_fkey"
    FOREIGN KEY ("enrollmentId") REFERENCES "CourseEnrollment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LessonProgress" ADD CONSTRAINT "LessonProgress_lessonId_fkey"
    FOREIGN KEY ("lessonId") REFERENCES "Lesson"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LessonAttachment" ADD CONSTRAINT "LessonAttachment_lessonId_fkey"
    FOREIGN KEY ("lessonId") REFERENCES "Lesson"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LessonComment" ADD CONSTRAINT "LessonComment_lessonId_fkey"
    FOREIGN KEY ("lessonId") REFERENCES "Lesson"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LessonComment" ADD CONSTRAINT "LessonComment_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

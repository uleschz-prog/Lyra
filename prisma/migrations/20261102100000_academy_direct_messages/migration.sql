CREATE TABLE "DirectMessageConversation" (
    "id" TEXT NOT NULL,
    "participantOneId" TEXT NOT NULL,
    "participantTwoId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DirectMessageConversation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DirectMessage" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DirectMessage_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DirectMessageConversation_participantOneId_participantTwoId_key"
ON "DirectMessageConversation"("participantOneId", "participantTwoId");

CREATE INDEX "DirectMessageConversation_participantOneId_updatedAt_idx"
ON "DirectMessageConversation"("participantOneId", "updatedAt");

CREATE INDEX "DirectMessageConversation_participantTwoId_updatedAt_idx"
ON "DirectMessageConversation"("participantTwoId", "updatedAt");

CREATE INDEX "DirectMessage_conversationId_createdAt_idx"
ON "DirectMessage"("conversationId", "createdAt");

CREATE INDEX "DirectMessage_senderId_createdAt_idx"
ON "DirectMessage"("senderId", "createdAt");

ALTER TABLE "DirectMessageConversation"
ADD CONSTRAINT "DirectMessageConversation_participantOneId_fkey"
FOREIGN KEY ("participantOneId") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DirectMessageConversation"
ADD CONSTRAINT "DirectMessageConversation_participantTwoId_fkey"
FOREIGN KEY ("participantTwoId") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DirectMessage"
ADD CONSTRAINT "DirectMessage_conversationId_fkey"
FOREIGN KEY ("conversationId") REFERENCES "DirectMessageConversation"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DirectMessage"
ADD CONSTRAINT "DirectMessage_senderId_fkey"
FOREIGN KEY ("senderId") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateIndex
CREATE UNIQUE INDEX "uq_user_phone" ON "users"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "uq_user_telegram_chat_id" ON "users"("telegram_chat_id");

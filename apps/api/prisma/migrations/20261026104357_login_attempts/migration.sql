-- CreateTable
CREATE TABLE "login_attempts" (
    "user_id" TEXT NOT NULL,
    "ip" TEXT NOT NULL,
    "failed_count" INTEGER NOT NULL,
    "first_failed_at" TIMESTAMP(3) NOT NULL,
    "lockout_until" TIMESTAMP(3),
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "login_attempts_pkey" PRIMARY KEY ("user_id","ip")
);

-- AddForeignKey
ALTER TABLE "login_attempts" ADD CONSTRAINT "login_attempts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

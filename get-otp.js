const { PrismaClient } = require("./backend/node_modules/@prisma/client");
const p = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL });
async function main() {
  const otp = await p.otpCode.findFirst({
    where: { user: { email: process.argv[2] || "whaider@silkroutelogistics.ai" }, used: false },
    orderBy: { createdAt: "desc" },
  });
  console.log(otp ? otp.code : "NO_OTP_FOUND");
  await p.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });

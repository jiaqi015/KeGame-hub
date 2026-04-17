import dotenv from 'dotenv';
import nodemailer from 'nodemailer';

dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });

async function main() {
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 465),
    secure: `${process.env.SMTP_SECURE || 'true'}`.trim().toLowerCase() !== 'false',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

  const info = await transporter.sendMail({
    from: process.env.EMAIL_FROM,
    to: 'yangjiaqi015@ke.com',
    subject: 'KeGame SMTP 测试邮件',
    text: '这是一封 KeGame SMTP 测试邮件，用于确认阿里云邮件发信链路可用。\n\n如果你收到这封邮件，说明当前 SMTP 配置已经打通。',
    html: `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;line-height:1.6;color:#111827;padding:24px;"><h2 style="margin:0 0 12px;">KeGame SMTP 测试邮件</h2><p style="margin:0 0 8px;">这是一封 KeGame SMTP 测试邮件，用于确认阿里云邮件发信链路可用。</p><p style="margin:0;color:#6b7280;">如果你收到这封邮件，说明当前 SMTP 配置已经打通。</p></div>`,
  });

  console.log(JSON.stringify({
    accepted: info.accepted,
    rejected: info.rejected,
    response: info.response,
    messageId: info.messageId,
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : error);
  process.exit(1);
});

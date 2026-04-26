import nodemailer from 'nodemailer';
import { deriveNicknameFromEmail } from './auth.js';

const SMTP_HOST_ENV_NAME = 'SMTP_HOST';
const SMTP_PORT_ENV_NAME = 'SMTP_PORT';
const SMTP_SECURE_ENV_NAME = 'SMTP_SECURE';
const SMTP_USER_ENV_NAME = 'SMTP_USER';
const SMTP_PASS_ENV_NAME = 'SMTP_PASS';
const EMAIL_FROM_ENV_NAME = 'EMAIL_FROM';

function getRequiredEnv(name: string): string {
  const value = (process.env[name] || '').trim();
  if (!value) {
    throw new Error(`缺少邮件配置 ${name}。`);
  }

  return value;
}

function createTransport() {
  const host = getRequiredEnv(SMTP_HOST_ENV_NAME);
  const port = Number(process.env[SMTP_PORT_ENV_NAME] || 465);
  const secure = `${process.env[SMTP_SECURE_ENV_NAME] || 'true'}`.trim().toLowerCase() !== 'false';
  const user = getRequiredEnv(SMTP_USER_ENV_NAME);
  const pass = getRequiredEnv(SMTP_PASS_ENV_NAME);

  return nodemailer.createTransport({
    host,
    port,
    secure,
    auth: {
      user,
      pass,
    },
  });
}

function getFromAddress(): string {
  return getRequiredEnv(EMAIL_FROM_ENV_NAME);
}

function formatMailTimestamp(timestamp: string): string {
  return new Date(timestamp).toLocaleString('zh-CN', {
    hour12: false,
    timeZone: 'Asia/Shanghai',
  });
}

function buildVerificationText(params: { nickname: string; code: string; expiresAtLabel: string }) {
  return [
    'KeGame Hub 登录验证码',
    '',
    `${params.nickname}，你好：`,
    '',
    '你正在登录 KeGame Hub。',
    '',
    `验证码：${params.code}`,
    `失效时间：${params.expiresAtLabel}`,
    '',
    '说明：',
    '1. 验证码 10 分钟内有效。',
    '2. 白名单账号可直接免验证码登录。',
    '3. 非白名单账号首次登录，还需要补充激活密钥完成注册和权限授权。',
    '',
    '如果这不是你的操作，请忽略这封邮件。',
    '',
    'KeGame Hub',
  ].join('\n');
}

function buildVerificationHtml(params: { nickname: string; code: string; expiresAtLabel: string }) {
  return `
    <div style="margin:0;padding:32px 0;background:#f4f6fb;">
      <div style="max-width:620px;margin:0 auto;padding:0 20px;">
        <div style="margin-bottom:16px;padding:0 8px;color:#6b7280;font-size:12px;letter-spacing:0.18em;text-transform:uppercase;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
          KeGame
        </div>
        <div style="background:linear-gradient(180deg,#ffffff 0%,#f8fafc 100%);border:1px solid #e5e7eb;border-radius:28px;overflow:hidden;box-shadow:0 24px 80px rgba(15,23,42,0.08);font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#111827;">
          <div style="padding:28px 32px 16px;background:radial-gradient(circle at top left,#dbeafe 0%,#eff6ff 28%,rgba(255,255,255,0) 70%);">
            <div style="display:inline-block;padding:6px 12px;border-radius:999px;background:#eef2ff;border:1px solid #dbeafe;color:#4b5563;font-size:11px;font-weight:700;letter-spacing:0.18em;text-transform:uppercase;">
              登录验证
            </div>
            <h1 style="margin:16px 0 10px;font-size:30px;line-height:1.15;letter-spacing:-0.03em;font-weight:700;color:#0f172a;">
              KeGame Hub 登录验证码
            </h1>
            <p style="margin:0;font-size:15px;line-height:1.8;color:#4b5563;">
              ${params.nickname}，你正在登录 KeGame Hub。请输入下面这组验证码完成身份校验。
            </p>
          </div>

          <div style="padding:8px 32px 0;">
            <div style="border-radius:24px;background:#0f172a;padding:22px 24px;text-align:center;box-shadow:inset 0 1px 0 rgba(255,255,255,0.08);">
              <div style="font-size:12px;letter-spacing:0.22em;text-transform:uppercase;color:rgba(255,255,255,0.62);margin-bottom:10px;">
                Verification Code
              </div>
              <div style="font-size:34px;line-height:1;font-weight:800;letter-spacing:0.26em;color:#ffffff;font-variant-numeric:tabular-nums;">
                ${params.code}
              </div>
            </div>
          </div>

          <div style="padding:24px 32px 8px;">
            <div style="display:flex;flex-wrap:wrap;gap:12px;">
              <div style="flex:1 1 220px;min-width:220px;border:1px solid #e5e7eb;border-radius:18px;background:#ffffff;padding:16px 18px;">
                <div style="font-size:11px;letter-spacing:0.16em;text-transform:uppercase;color:#9ca3af;margin-bottom:8px;">有效期</div>
                <div style="font-size:15px;font-weight:600;color:#111827;">${params.expiresAtLabel}</div>
              </div>
              <div style="flex:1 1 220px;min-width:220px;border:1px solid #e5e7eb;border-radius:18px;background:#ffffff;padding:16px 18px;">
                <div style="font-size:11px;letter-spacing:0.16em;text-transform:uppercase;color:#9ca3af;margin-bottom:8px;">登录规则</div>
                <div style="font-size:15px;font-weight:600;color:#111827;">首次登录需补充激活密钥</div>
              </div>
            </div>
          </div>

          <div style="padding:8px 32px 0;">
            <div style="border-radius:20px;background:#f8fafc;border:1px solid #e5e7eb;padding:18px 20px;">
              <div style="font-size:13px;font-weight:700;color:#111827;margin-bottom:10px;">使用提醒</div>
              <ul style="padding-left:18px;margin:0;color:#4b5563;font-size:14px;line-height:1.8;">
                <li>验证码 10 分钟内有效，请勿转发给他人。</li>
                <li>白名单账号可直接免验证码登录。</li>
                <li>非白名单账号首次登录时，还需补充激活密钥完成注册与权限授权。</li>
              </ul>
            </div>
          </div>

          <div style="padding:24px 32px 32px;">
            <div style="font-size:13px;line-height:1.8;color:#6b7280;">
              如果这不是你的操作，请直接忽略这封邮件。
            </div>
            <div style="margin-top:18px;padding-top:18px;border-top:1px solid #e5e7eb;font-size:12px;letter-spacing:0.14em;text-transform:uppercase;color:#9ca3af;">
              KeGame Hub
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
}

export async function sendVerificationEmail(params: {
  to: string;
  code: string;
  expiresAt: string;
}) {
  const transporter = createTransport();
  const expiresAtLabel = formatMailTimestamp(params.expiresAt);
  const nickname = deriveNicknameFromEmail(params.to);

  await transporter.sendMail({
    from: getFromAddress(),
    to: params.to,
    subject: 'KeGame Hub 登录验证码',
    text: buildVerificationText({ nickname, code: params.code, expiresAtLabel }),
    html: buildVerificationHtml({ nickname, code: params.code, expiresAtLabel }),
  });
}

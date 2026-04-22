import dotenv from 'dotenv';
import nodemailer from 'nodemailer';

dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });

interface CliOptions {
  send: boolean;
  to: string;
  help: boolean;
}

function parseArgs(argv: string[]): CliOptions {
  let send = false;
  let to = '';
  let help = false;

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];

    if (token === '--send') {
      send = true;
      continue;
    }

    if (token === '--help' || token === '-h') {
      help = true;
      continue;
    }

    if (token === '--to' || token === '-t') {
      const value = argv[index + 1];
      if (!value || value.startsWith('-')) {
        throw new Error('参数 --to 需要一个收件人邮箱。');
      }
      to = value.trim();
      index += 1;
      continue;
    }

    if (!token.startsWith('-') && !to) {
      to = token.trim();
      continue;
    }

    throw new Error(`未知参数：${token}`);
  }

  return { send, to, help };
}

function printHelp() {
  console.log([
    'SMTP 测试脚本（默认安全 dry-run）',
    '',
    '用法：',
    '  npx tsx scripts/send-smtp-test.ts [--to <email>]          # 默认 dry-run，不发信',
    '  npx tsx scripts/send-smtp-test.ts --send --to <email>     # 显式发信',
    '',
    '参数：',
    '  --send       显式允许真实发信',
    '  --to, -t     收件人邮箱（真实发信时必填）',
    '  --help, -h   查看帮助',
  ].join('\n'));
}

function getRequiredEnv(name: string): string {
  const value = `${process.env[name] || ''}`.trim();
  if (!value) {
    throw new Error(`缺少环境变量 ${name}。`);
  }
  return value;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }

  if (!options.send) {
    console.log(JSON.stringify({
      mode: 'dry-run',
      message: '默认安全模式：未真实发信。添加 --send --to <email> 才会发送。',
      to: options.to || null,
      smtpConfigured: {
        host: Boolean(`${process.env.SMTP_HOST || ''}`.trim()),
        port: Number(process.env.SMTP_PORT || 465),
        secure: `${process.env.SMTP_SECURE || 'true'}`.trim().toLowerCase() !== 'false',
        user: Boolean(`${process.env.SMTP_USER || ''}`.trim()),
        pass: Boolean(`${process.env.SMTP_PASS || ''}`.trim()),
        from: Boolean(`${process.env.EMAIL_FROM || ''}`.trim()),
      },
    }, null, 2));
    return;
  }

  if (!options.to) {
    throw new Error('真实发信模式必须显式提供 --to <email>。');
  }

  const smtpHost = getRequiredEnv('SMTP_HOST');
  const smtpUser = getRequiredEnv('SMTP_USER');
  const smtpPass = getRequiredEnv('SMTP_PASS');
  const emailFrom = getRequiredEnv('EMAIL_FROM');

  const transporter = nodemailer.createTransport({
    host: smtpHost,
    port: Number(process.env.SMTP_PORT || 465),
    secure: `${process.env.SMTP_SECURE || 'true'}`.trim().toLowerCase() !== 'false',
    auth: {
      user: smtpUser,
      pass: smtpPass,
    },
  });

  const info = await transporter.sendMail({
    from: emailFrom,
    to: options.to,
    subject: 'KeGame SMTP 测试邮件',
    text: '这是一封 KeGame SMTP 测试邮件，用于确认阿里云邮件发信链路可用。\n\n如果你收到这封邮件，说明当前 SMTP 配置已经打通。',
    html: `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;line-height:1.6;color:#111827;padding:24px;"><h2 style="margin:0 0 12px;">KeGame SMTP 测试邮件</h2><p style="margin:0 0 8px;">这是一封 KeGame SMTP 测试邮件，用于确认阿里云邮件发信链路可用。</p><p style="margin:0;color:#6b7280;">如果你收到这封邮件，说明当前 SMTP 配置已经打通。</p></div>`,
  });

  console.log(JSON.stringify({
    mode: 'sent',
    to: options.to,
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

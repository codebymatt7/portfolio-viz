const { Resend } = require('resend');

const FROM = process.env.EMAIL_FROM || 'onboarding@resend.dev';

let _resend = null;
function client() {
  if (_resend) return _resend;
  if (!process.env.RESEND_API_KEY) return null;
  _resend = new Resend(process.env.RESEND_API_KEY);
  return _resend;
}

async function sendMagicLink({ to, link }) {
  const c = client();
  if (!c) {
    // Dev fallback: log the link so you can click it without sending mail.
    console.log(`[DEV] magic link for ${to}: ${link}`);
    return { dev: true };
  }
  const subject = 'Your portfolio-viz sign-in link';
  const html = `
    <div style="font-family:-apple-system,Segoe UI,Inter,sans-serif;font-size:15px;line-height:1.5;color:#111;max-width:480px;padding:24px;">
      <h2 style="margin:0 0 12px 0;font-size:18px;">Sign in to Portfolio Viz</h2>
      <p style="margin:0 0 18px 0;color:#444;">Click the button below to sign in. This link expires in 15 minutes.</p>
      <p style="margin:0 0 24px 0;">
        <a href="${link}" style="display:inline-block;background:#7c5cff;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;font-weight:600;">Sign in</a>
      </p>
      <p style="margin:0;color:#888;font-size:13px;">Or paste this URL into your browser:<br><span style="word-break:break-all;color:#555;">${link}</span></p>
    </div>
  `;
  const text = `Sign in to Portfolio Viz:\n${link}\n\nThis link expires in 15 minutes.`;
  const res = await c.emails.send({ from: FROM, to, subject, html, text });
  return res;
}

module.exports = { sendMagicLink };

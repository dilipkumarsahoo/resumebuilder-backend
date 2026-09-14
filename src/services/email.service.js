const nodemailer = require('nodemailer');

/**
 * Creates a nodemailer transporter based on environment configuration.
 * Returns null if SMTP credentials are not configured.
 */
const getTransporter = () => {
  const host = process.env.SMTP_HOST || 'smtp.gmail.com';
  const port = parseInt(process.env.SMTP_PORT || '587', 10);
  const secure = process.env.SMTP_SECURE === 'true' || port === 465;
  const user = process.env.SMTP_USER?.trim();
  const pass = process.env.SMTP_PASS?.trim();

  if (!user || !pass) {
    return null;
  }

  return nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass },
  });
};

/**
 * Sends an email or logs a dev preview if SMTP is unconfigured.
 */
const sendEmail = async ({ to, subject, html, text }) => {
  const from = process.env.EMAIL_FROM || 'GlowCV Support <no-reply@glowcv.com>';
  const transporter = getTransporter();

  if (!transporter) {
    console.log('\n======================================================');
    console.log('⚠️ [EMAIL SERVICE] SMTP credentials not set in backend/.env');
    console.log(`✉️ Simulated sending email to: ${to}`);
    console.log(`📌 Subject: ${subject}`);
    console.log('------------------------------------------------------');
    if (text) console.log(`📄 Message:\n${text}`);
    console.log('======================================================\n');
    return { sent: false, simulated: true };
  }

  try {
    const info = await transporter.sendMail({
      from,
      to,
      subject,
      html,
      text,
    });
    console.log(`✅ [EMAIL SERVICE] Email sent to ${to}: ${info.messageId}`);
    return { sent: true, messageId: info.messageId };
  } catch (error) {
    console.error('❌ [EMAIL SERVICE] Failed to send email:', error.message);
    console.log('------------------------------------------------------');
    console.log(`✉️ Fallback log for: ${to}`);
    console.log(`📌 Subject: ${subject}`);
    if (text) console.log(`📄 Content:\n${text}`);
    console.log('------------------------------------------------------\n');
    throw error;
  }
};

/**
 * Sends a password reset email with responsive HTML template.
 */
const sendPasswordResetEmail = async (toEmail, resetUrl) => {
  const subject = 'Reset Your GlowCV Password';

  const text = `Hello,

We received a request to reset your password for your GlowCV account.

Please click the link below or copy and paste it into your browser to reset your password:
${resetUrl}

This link is valid for 1 hour. If you did not request this, please ignore this email.

Best regards,
The GlowCV Team`;

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Reset Your GlowCV Password</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; color: #1e293b;">
  <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #f8fafc; padding: 40px 16px;">
    <tr>
      <td align="center">
        <table width="100%" border="0" cellspacing="0" cellpadding="0" style="max-width: 520px; background-color: #ffffff; border-radius: 16px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);">
          
          <!-- Header -->
          <tr>
            <td style="padding: 32px 32px 24px 32px; text-align: center; border-bottom: 1px solid #f1f5f9;">
              <div style="display: inline-flex; align-items: center; justify-content: center; gap: 8px;">
                <span style="font-size: 22px; font-weight: 800; color: #0f172a; letter-spacing: -0.5px;">Glow<span style="color: #1b4df0;">CV</span></span>
              </div>
            </td>
          </tr>

          <!-- Content -->
          <tr>
            <td style="padding: 32px;">
              <h2 style="margin: 0 0 16px 0; font-size: 20px; font-weight: 700; color: #0f172a; line-height: 1.3;">
                Password Reset Request
              </h2>
              <p style="margin: 0 0 20px 0; font-size: 14px; line-height: 1.6; color: #475569;">
                We received a request to reset the password associated with your email (<strong>${toEmail}</strong>).
              </p>
              <p style="margin: 0 0 28px 0; font-size: 14px; line-height: 1.6; color: #475569;">
                Click the button below to choose a new password. This link is valid for <strong>1 hour</strong>.
              </p>

              <!-- Action Button -->
              <table width="100%" border="0" cellspacing="0" cellpadding="0" style="margin-bottom: 28px;">
                <tr>
                  <td align="center">
                    <a href="${resetUrl}" target="_blank" style="display: inline-block; background-color: #1b4df0; color: #ffffff; text-decoration: none; font-size: 14px; font-weight: 600; padding: 12px 28px; border-radius: 10px; box-shadow: 0 2px 4px rgba(27, 77, 240, 0.2);">
                      Reset Password
                    </a>
                  </td>
                </tr>
              </table>

              <p style="margin: 0 0 12px 0; font-size: 12px; color: #64748b; line-height: 1.5;">
                If the button above doesn't work, copy and paste this URL into your web browser:
              </p>
              <p style="margin: 0 0 24px 0; font-size: 12px; color: #1b4df0; word-break: break-all; line-height: 1.4;">
                <a href="${resetUrl}" target="_blank" style="color: #1b4df0; text-decoration: underline;">${resetUrl}</a>
              </p>

              <hr style="border: none; border-top: 1px solid #f1f5f9; margin: 24px 0;" />

              <p style="margin: 0; font-size: 12px; color: #94a3b8; line-height: 1.5;">
                If you didn't request a password reset, you can safely ignore this email. Your password will not change until you access the link above.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 20px 32px; background-color: #f8fafc; border-top: 1px solid #f1f5f9; text-align: center;">
              <p style="margin: 0; font-size: 11px; color: #94a3b8;">
                &copy; ${new Date().getFullYear()} GlowCV. All rights reserved.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`;

  return sendEmail({
    to: toEmail,
    subject,
    html,
    text,
  });
};

module.exports = {
  sendEmail,
  sendPasswordResetEmail,
};

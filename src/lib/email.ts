import { Resend } from 'resend';

// Initialize Resend client
const resend = new Resend(process.env.RESEND_API_KEY);

const FROM_EMAIL = 'WOML <noreply@womleads.com>';
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://womleads.com';

interface SendEmailResult {
  success: boolean;
  error?: string;
}

/**
 * Send a password reset email
 */
export async function sendPasswordResetEmail(
  email: string,
  token: string
): Promise<SendEmailResult> {
  const resetUrl = `${SITE_URL}/auth/reset-password?token=${token}`;

  try {
    const { error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: email,
      subject: 'Reset Your WOML Password',
      html: `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
          </head>
          <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f5f5f5; margin: 0; padding: 20px;">
            <div style="max-width: 500px; margin: 0 auto; background: white; border-radius: 12px; padding: 40px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
              <div style="text-align: center; margin-bottom: 30px;">
                <h1 style="color: #1e3a5f; margin: 0; font-size: 28px;">WOML</h1>
                <p style="color: #666; margin: 5px 0 0 0; font-size: 14px;">Word of Mouth Leads</p>
              </div>

              <h2 style="color: #1e3a5f; margin: 0 0 20px 0; font-size: 20px;">Reset Your Password</h2>

              <p style="color: #333; line-height: 1.6; margin: 0 0 20px 0;">
                You requested a password reset for your WOML account. Click the button below to create a new password.
              </p>

              <div style="text-align: center; margin: 30px 0;">
                <a href="${resetUrl}" style="display: inline-block; background: #1e3a5f; color: white; padding: 14px 32px; text-decoration: none; border-radius: 8px; font-weight: 600;">
                  Reset Password
                </a>
              </div>

              <p style="color: #666; font-size: 14px; line-height: 1.6; margin: 0 0 10px 0;">
                This link will expire in 1 hour. If you didn't request this, you can safely ignore this email.
              </p>

              <p style="color: #999; font-size: 12px; line-height: 1.6; margin: 20px 0 0 0; padding-top: 20px; border-top: 1px solid #eee;">
                If the button doesn't work, copy and paste this link into your browser:<br>
                <a href="${resetUrl}" style="color: #1e3a5f; word-break: break-all;">${resetUrl}</a>
              </p>

              <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; text-align: center;">
                <p style="color: #999; font-size: 12px; margin: 0;">
                  Powered by Options Insurance Agency
                </p>
              </div>
            </div>
          </body>
        </html>
      `,
    });

    if (error) {
      console.error('[EMAIL] Failed to send password reset email:', error);
      return { success: false, error: error.message };
    }

    console.log('[EMAIL] Password reset email sent to:', email);
    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[EMAIL] Exception sending email:', message);
    return { success: false, error: message };
  }
}

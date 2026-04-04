import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { getUserByEmail, createPasswordResetToken } from '@/lib/db';
import { sendPasswordResetEmail } from '@/lib/email';

/**
 * POST /api/auth/forgot-password
 * Request a password reset email
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email } = body;

    if (!email) {
      return NextResponse.json(
        { success: false, error: 'Email is required' },
        { status: 400 }
      );
    }

    // Normalize email
    const normalizedEmail = email.toLowerCase().trim();

    // Always return success to prevent email enumeration
    const successResponse = NextResponse.json({
      success: true,
      message: 'If an account exists with this email, you will receive a password reset link.',
    });

    // Look up user
    const user = await getUserByEmail(normalizedEmail);

    if (!user) {
      // User doesn't exist, but return success to prevent enumeration
      console.log('[FORGOT-PASSWORD] No user found for:', normalizedEmail);
      return successResponse;
    }

    if (!user.is_active) {
      // Account is deactivated
      console.log('[FORGOT-PASSWORD] User account deactivated:', normalizedEmail);
      return successResponse;
    }

    // Generate a secure random token
    const token = crypto.randomBytes(32).toString('hex');

    // Hash the token for storage (don't store plain tokens)
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

    // Store the hashed token in the database
    await createPasswordResetToken(user.id, tokenHash, 1); // 1 hour expiry

    // Send the email with the plain token (user clicks link with plain token)
    const emailResult = await sendPasswordResetEmail(user.email, token);

    if (!emailResult.success) {
      console.error('[FORGOT-PASSWORD] Failed to send email:', emailResult.error);
      // Still return success to user (don't reveal email sending issues)
    } else {
      console.log('[FORGOT-PASSWORD] Reset email sent to:', normalizedEmail);
    }

    return successResponse;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[FORGOT-PASSWORD] Error:', message);

    // Return generic error to avoid information leakage
    return NextResponse.json(
      { success: false, error: 'Unable to process request. Please try again.' },
      { status: 500 }
    );
  }
}

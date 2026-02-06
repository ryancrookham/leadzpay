import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { getValidResetToken, markTokenUsed, updateUserPassword } from '@/lib/db';

/**
 * POST /api/auth/reset-password
 * Reset password using a valid token
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { token, password } = body;

    if (!token) {
      return NextResponse.json(
        { success: false, error: 'Reset token is required' },
        { status: 400 }
      );
    }

    if (!password) {
      return NextResponse.json(
        { success: false, error: 'New password is required' },
        { status: 400 }
      );
    }

    // Validate password requirements
    if (password.length < 8) {
      return NextResponse.json(
        { success: false, error: 'Password must be at least 8 characters' },
        { status: 400 }
      );
    }

    // Check for letters and numbers
    const hasLetter = /[a-zA-Z]/.test(password);
    const hasNumber = /[0-9]/.test(password);

    if (!hasLetter || !hasNumber) {
      return NextResponse.json(
        { success: false, error: 'Password must contain at least one letter and one number' },
        { status: 400 }
      );
    }

    // Hash the provided token to look it up
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

    // Look up the token
    const resetToken = await getValidResetToken(tokenHash);

    if (!resetToken) {
      console.log('[RESET-PASSWORD] Invalid or expired token');
      return NextResponse.json(
        { success: false, error: 'Invalid or expired reset link. Please request a new one.' },
        { status: 400 }
      );
    }

    // Hash the new password
    const passwordHash = await bcrypt.hash(password, 12);

    // Update the user's password
    await updateUserPassword(resetToken.user_id, passwordHash);

    // Mark the token as used
    await markTokenUsed(resetToken.id);

    console.log('[RESET-PASSWORD] Password reset successful for user:', resetToken.user_id);

    return NextResponse.json({
      success: true,
      message: 'Password has been reset successfully. You can now log in with your new password.',
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[RESET-PASSWORD] Error:', message);

    return NextResponse.json(
      { success: false, error: 'Unable to reset password. Please try again.' },
      { status: 500 }
    );
  }
}

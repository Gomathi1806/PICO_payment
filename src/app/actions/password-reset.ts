'use server';

import { randomBytes, createHash } from 'node:crypto';
import { headers } from 'next/headers';
import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { users, passwordResetTokens } from '@/db/schema';
import { auth } from '@/auth';
import { isAdmin } from '@/lib/roles';

const TOKEN_TTL_MS = 60 * 60 * 1000; // reset links live for 1 hour

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** Mints a token, stores only its hash, and returns the reset path. */
async function issueResetToken(userId: string): Promise<string> {
  const token = randomBytes(32).toString('base64url');
  await db.insert(passwordResetTokens).values({
    userId,
    tokenHash: hashToken(token),
    expiresAt: new Date(Date.now() + TOKEN_TTL_MS),
  });
  return `/reset-password?token=${token}`;
}

/**
 * Origin for links in emails. Behind Vercel the forwarded headers are
 * authoritative; locally there's no x-forwarded-proto so fall back to
 * http for localhost.
 */
async function getBaseUrl(): Promise<string> {
  const h = await headers();
  const host = h.get('x-forwarded-host') ?? h.get('host');
  if (host) {
    const proto = h.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https');
    return `${proto}://${host}`;
  }
  return (process.env.AUTH_URL || 'http://localhost:3000').replace(/\/$/, '');
}

async function sendResetEmail(to: string, resetUrl: string): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    // Email delivery not configured — surface the link in server logs so
    // the operator can still rescue a locked-out user by hand.
    console.warn('[password-reset] RESEND_API_KEY not set. Manual reset link for', to, '→', resetUrl);
    return false;
  }

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: process.env.RESET_EMAIL_FROM || 'Pico <onboarding@resend.dev>',
        to: [to],
        subject: 'Reset your Pico password',
        html: [
          '<div style="font-family:sans-serif;max-width:480px;margin:0 auto">',
          '<h2>Reset your Pico password</h2>',
          '<p>Someone (hopefully you) asked to reset the password for this account. This link works once and expires in 1 hour.</p>',
          `<p><a href="${resetUrl}" style="display:inline-block;background:#3b82f6;color:#fff;padding:12px 24px;border-radius:12px;text-decoration:none;font-weight:600">Choose a new password</a></p>`,
          `<p style="color:#64748b;font-size:13px">Or paste this into your browser:<br>${resetUrl}</p>`,
          '<p style="color:#64748b;font-size:13px">Didn\'t ask for this? You can safely ignore this email — your password is unchanged.</p>',
          '</div>',
        ].join(''),
      }),
    });
    if (!res.ok) {
      console.error('[password-reset] Resend API error', res.status, await res.text());
      return false;
    }
    return true;
  } catch (error) {
    console.error('[password-reset] failed to send email', error);
    return false;
  }
}

/**
 * Self-serve "forgot password". Always claims success for existing and
 * unknown emails alike so the form can't be used to probe which emails
 * have accounts. `emailConfigured` lets the UI be honest when no email
 * service is wired up yet (the user would otherwise wait for an email
 * that never comes).
 */
export async function requestPasswordReset(rawEmail: string) {
  const emailConfigured = Boolean(process.env.RESEND_API_KEY);
  const email = rawEmail.toLowerCase().trim();
  if (!email) return { success: false as const, emailConfigured, error: 'Enter your email address.' };

  try {
    const user = await db.query.users.findFirst({ where: eq(users.email, email) });
    if (user) {
      const path = await issueResetToken(user.id);
      const resetUrl = `${await getBaseUrl()}${path}`;
      await sendResetEmail(email, resetUrl);
    }
    return { success: true as const, emailConfigured };
  } catch (error) {
    console.error('[password-reset] request failed', error);
    return { success: false as const, emailConfigured, error: 'Something went wrong. Please try again.' };
  }
}

/** Consumes a reset token and sets the new password. */
export async function resetPassword(data: { token: string; password: string }) {
  if (!data.token) {
    return { success: false as const, error: 'This reset link is missing its token. Use the full link you were sent.' };
  }
  // Mirror the signup rule in registerUser.
  if (!data.password || data.password.length < 6) {
    return { success: false as const, error: 'Password must be at least 6 characters.' };
  }

  try {
    const row = await db.query.passwordResetTokens.findFirst({
      where: eq(passwordResetTokens.tokenHash, hashToken(data.token)),
    });

    if (!row || row.usedAt || row.expiresAt < new Date()) {
      return { success: false as const, error: 'This reset link is invalid, already used, or expired. Request a new one.' };
    }

    const passwordHash = await bcrypt.hash(data.password, 12);
    await db.update(users).set({ passwordHash }).where(eq(users.id, row.userId));
    await db
      .update(passwordResetTokens)
      .set({ usedAt: new Date() })
      .where(eq(passwordResetTokens.id, row.id));

    return { success: true as const };
  } catch (error) {
    console.error('[password-reset] reset failed', error);
    return { success: false as const, error: 'Something went wrong. Please try again.' };
  }
}

/**
 * Admin rescue hatch: generate a reset link for a user without email
 * delivery — the admin copies it and sends it over any channel. Same
 * token rules as the self-serve flow (single use, 1 hour).
 */
export async function adminCreateResetLink(rawEmail: string) {
  const session = await auth();
  const allowed = await isAdmin(session?.user?.id, session?.user?.email ?? undefined);
  if (!allowed) return { success: false as const, error: 'Not authorized.' };

  const email = rawEmail.toLowerCase().trim();
  if (!email) return { success: false as const, error: 'Enter the user’s email address.' };

  try {
    const user = await db.query.users.findFirst({ where: eq(users.email, email) });
    if (!user) return { success: false as const, error: 'No account with that email.' };

    const path = await issueResetToken(user.id);
    return { success: true as const, path, handle: user.handle };
  } catch (error) {
    console.error('[password-reset] admin link failed', error);
    return { success: false as const, error: 'Something went wrong. Please try again.' };
  }
}

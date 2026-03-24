import type { User } from '@supabase/supabase-js';
import { Request, Response } from 'express';
import {
  getBrandProfileByUserId,
  upsertBrandProfile,
} from '../db/queries/brandProfiles';
import {
  getClientAppUrl,
  getSupabaseAuthRedirectUrl,
  requireSessionUserClient,
  requireUserClient,
  supabaseAuth,
} from '../db/supabase';
import {
  AuthEmailInput,
  AuthSessionInput,
  PasswordLoginInput,
  UpdatePasswordInput,
} from '../schemas/auth.schema';
import { AuthProfileInput } from '../schemas/user.schema';
import type { BrandProfileInput } from '../types';

type AuthenticatedRequest<
  Params = Record<string, string>,
  ResBody = unknown,
  ReqBody = unknown,
  ReqQuery = Record<string, unknown>
> = Request<Params, ResBody, ReqBody, ReqQuery> & {
  user?: User;
  accessToken?: string;
};

const toBrandProfileInput = (body: AuthProfileInput): BrandProfileInput => ({
  fullName: body.fullName,
  phoneNumber: body.phoneNumber ?? null,
  username: body.username ?? null,
  avatarUrl: body.avatarUrl ?? null,
  industry: body.industry ?? null,
  targetAudience: body.targetAudience ?? null,
  brandVoice: body.brandVoice ?? null,
  description: body.description ?? null,
});

const genericEmailMessage =
  'If the email can receive messages, instructions will arrive shortly.';

const invalidCredentialsMessage = 'Invalid email or password.';

const getPasswordSetupState = (user?: User) => ({
  shouldSetPassword: !Boolean(user?.user_metadata?.has_password),
});

const ensureSupabaseAuth = () => {
  if (!supabaseAuth) {
    throw new Error(
      'Supabase auth client is not configured. Set SUPABASE_URL and SUPABASE_ANON_KEY in server/.env.'
    );
  }

  return supabaseAuth;
};

export const sendMagicLink = async (
  req: Request<{}, unknown, AuthEmailInput>,
  res: Response
) => {
  try {
    const authClient = ensureSupabaseAuth();
    const { email } = req.body;

    await authClient.auth.signInWithOtp({
      email,
      options: {
        shouldCreateUser: true,
        emailRedirectTo: getSupabaseAuthRedirectUrl(),
      },
    });

    return res.status(202).json({
      status: 'success',
      message: genericEmailMessage,
      method: 'magic_link',
    });
  } catch (error) {
    return res.status(500).json({
      status: 'error',
      message:
        error instanceof Error ? error.message : 'Failed to send magic link',
    });
  }
};

export const loginWithPassword = async (
  req: Request<{}, unknown, PasswordLoginInput>,
  res: Response
) => {
  try {
    const authClient = ensureSupabaseAuth();
    const { email, password } = req.body;
    const { data, error } = await authClient.auth.signInWithPassword({
      email,
      password,
    });

    if (error || !data.session || !data.user) {
      return res.status(401).json({
        status: 'fail',
        message: invalidCredentialsMessage,
      });
    }

    return res.status(200).json({
      status: 'success',
      message: 'Login successful',
      session: data.session,
      user: data.user,
      onboarding: getPasswordSetupState(data.user),
    });
  } catch (error) {
    return res.status(500).json({
      status: 'error',
      message:
        error instanceof Error ? error.message : 'Password login failed',
    });
  }
};

export const sendForgotPasswordMagicLink = async (
  req: Request<{}, unknown, AuthEmailInput>,
  res: Response
) => {
  try {
    const authClient = ensureSupabaseAuth();
    const { email } = req.body;

    await authClient.auth.signInWithOtp({
      email,
      options: {
        shouldCreateUser: false,
        emailRedirectTo: getSupabaseAuthRedirectUrl(),
      },
    });

    return res.status(202).json({
      status: 'success',
      message: genericEmailMessage,
      method: 'magic_link',
    });
  } catch (error) {
    return res.status(500).json({
      status: 'error',
      message:
        error instanceof Error
          ? error.message
          : 'Failed to send login link',
    });
  }
};

export const sendPasswordResetEmail = async (
  req: Request<{}, unknown, AuthEmailInput>,
  res: Response
) => {
  try {
    const authClient = ensureSupabaseAuth();
    const { email } = req.body;

    await authClient.auth.resetPasswordForEmail(email, {
      redirectTo: `${getClientAppUrl().replace(/\/$/, '')}/update-password`,
    });

    return res.status(202).json({
      status: 'success',
      message: genericEmailMessage,
      method: 'password_reset',
    });
  } catch (error) {
    return res.status(500).json({
      status: 'error',
      message:
        error instanceof Error
          ? error.message
          : 'Failed to send password reset email',
    });
  }
};

export const restoreSession = async (
  req: Request<{}, unknown, AuthSessionInput>,
  res: Response
) => {
  try {
    const client = await requireSessionUserClient(
      req.body.accessToken,
      req.body.refreshToken
    );
    const {
      data: { session },
      error,
    } = await client.auth.getSession();

    if (error || !session) {
      return res.status(401).json({
        status: 'fail',
        message: 'Session not found or expired.',
      });
    }

    return res.status(200).json({
      status: 'success',
      session,
      user: session.user,
      onboarding: getPasswordSetupState(session.user),
    });
  } catch (_error) {
    return res.status(401).json({
      status: 'fail',
      message: 'Session not found or expired.',
    });
  }
};

export const updatePassword = async (
  req: Request<{}, unknown, UpdatePasswordInput>,
  res: Response
) => {
  try {
    const client = await requireSessionUserClient(
      req.body.accessToken,
      req.body.refreshToken
    );
    const { data, error } = await client.auth.updateUser({
      password: req.body.password,
      data: {
        has_password: true,
      },
    });

    if (error || !data.user) {
      return res.status(400).json({
        status: 'fail',
        message: 'Unable to update password. The session may be expired.',
      });
    }

    return res.status(200).json({
      status: 'success',
      message: 'Password updated successfully',
      user: data.user,
      onboarding: getPasswordSetupState(data.user),
    });
  } catch (_error) {
    return res.status(400).json({
      status: 'fail',
      message: 'Unable to update password. The session may be expired.',
    });
  }
};

export const logout = async (
  req: Request<{}, unknown, AuthSessionInput>,
  res: Response
) => {
  try {
    const client = await requireSessionUserClient(
      req.body.accessToken,
      req.body.refreshToken
    );
    await client.auth.signOut({ scope: 'global' });

    return res.status(200).json({
      status: 'success',
      message: 'Logged out successfully',
    });
  } catch (_error) {
    return res.status(400).json({
      status: 'fail',
      message: 'Unable to log out with the provided session.',
    });
  }
};

export const saveProfile = async (
  req: AuthenticatedRequest<{}, unknown, AuthProfileInput>,
  res: Response
) => {
  if (!req.user?.id) {
    return res.status(401).json({
      status: 'fail',
      message: 'Unauthorized',
    });
  }

  try {
    const client = requireUserClient(req.accessToken);
    const profile = await upsertBrandProfile(
      client,
      req.user.id,
      toBrandProfileInput(req.body)
    );

    return res.status(200).json({
      status: 'success',
      message: 'Brand profile saved successfully',
      profile,
    });
  } catch (error) {
    return res.status(500).json({
      status: 'error',
      message:
        error instanceof Error
          ? error.message
          : 'Failed to save brand profile',
    });
  }
};

export const getMe = async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user?.id) {
    return res.status(401).json({
      status: 'fail',
      message: 'Unauthorized',
    });
  }

  try {
    const client = requireUserClient(req.accessToken);
    const profile = await getBrandProfileByUserId(client, req.user.id);

    return res.status(200).json({
      status: 'success',
      user: req.user,
      profile,
      onboarding: getPasswordSetupState(req.user),
    });
  } catch (error) {
    return res.status(500).json({
      status: 'error',
      message:
        error instanceof Error ? error.message : 'Failed to load current user',
    });
  }
};

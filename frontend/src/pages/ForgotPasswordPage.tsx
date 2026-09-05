import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  useCreatePasswordResetRequestMutation,
  useRequestPasswordResetMutation,
  useResetPasswordMutation,
  useSendOtpMutation,
  useVerifyOtpMutation,
} from '../app/api/passwordResetApi';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import type { OtpChannel } from '../types/api';
import { inputClassName, primaryButtonClassName, secondaryButtonClassName } from './authFormStyles';

const RESEND_COOLDOWN_SECONDS = 45;

type Step = 'identify' | 'method' | 'pending' | 'otp' | 'reset' | 'done';

export function ForgotPasswordPage(): JSX.Element {
  const navigate = useNavigate();

  const [step, setStep] = useState<Step>('identify');
  const [username, setUsername] = useState('');
  const [maskedEmail, setMaskedEmail] = useState<string | null>(null);
  const [maskedMobile, setMaskedMobile] = useState<string | null>(null);
  const [channel, setChannel] = useState<OtpChannel | null>(null);
  const [otp, setOtp] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [cooldown, setCooldown] = useState(0);
  const [notFoundMessage, setNotFoundMessage] = useState<string | null>(null);
  // MD self-serves via its own email/mobile (the 'method' picker below);
  // every other role has the code delivered to an eligible approver
  // instead — entering that code IS the approval, there's no separate
  // approve/reject step anywhere.
  const [selfService, setSelfService] = useState(true);
  const [approverRolesLabel, setApproverRolesLabel] = useState('');

  const [requestPasswordReset, requestState] = useRequestPasswordResetMutation();
  const [createPasswordResetRequest, createRequestState] = useCreatePasswordResetRequestMutation();
  const [sendOtp, sendOtpState] = useSendOtpMutation();
  const [verifyOtp, verifyOtpState] = useVerifyOtpMutation();
  const [resetPassword, resetState] = useResetPasswordMutation();

  const cooldownTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    return () => {
      if (cooldownTimer.current) clearInterval(cooldownTimer.current);
    };
  }, []);

  const startCooldown = (): void => {
    setCooldown(RESEND_COOLDOWN_SECONDS);
    if (cooldownTimer.current) clearInterval(cooldownTimer.current);
    cooldownTimer.current = setInterval(() => {
      setCooldown((s) => {
        if (s <= 1 && cooldownTimer.current) {
          clearInterval(cooldownTimer.current);
        }
        return Math.max(0, s - 1);
      });
    }, 1000);
  };

  const onIdentifySubmit = async (e: FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault();
    setNotFoundMessage(null);
    try {
      const res = await requestPasswordReset({ username }).unwrap();
      if (!res.found) {
        setNotFoundMessage(
          "We couldn't find recovery options for this account. Check the username or contact your administrator.",
        );
        return;
      }

      if (res.selfService) {
        // MD — unchanged self-service path. The requester's own masked
        // contact info gates whether there's anything to pick from.
        if (!res.maskedEmail && !res.maskedMobile) {
          setNotFoundMessage(
            "We couldn't find recovery options for this account. Check the username or contact your administrator.",
          );
          return;
        }
        setSelfService(true);
        setMaskedEmail(res.maskedEmail);
        setMaskedMobile(res.maskedMobile);
        setChannel(res.maskedEmail ? 'email' : 'mobile');
        setStep('method');
        return;
      }

      // Admin/PD/Viewer — the code is delivered to an eligible approver,
      // not to this account's own contact info, so that info is irrelevant
      // here.
      setSelfService(false);
      setApproverRolesLabel(res.approverRolesLabel ?? '');
      switch (res.requestStatus) {
        case 'pending':
          setStep('pending');
          break;
        case 'approved': {
          const approvedChannel = res.channel ?? 'email';
          setChannel(approvedChannel);
          await sendOtp({ username, channel: approvedChannel }).unwrap();
          startCooldown();
          setStep('otp');
          break;
        }
        case 'none':
        default: {
          const createRes = await createPasswordResetRequest({ username, channel: 'email' }).unwrap();
          setChannel('email');
          if (createRes.otpSent) {
            startCooldown();
            setStep('otp');
          } else {
            setStep('pending');
          }
          break;
        }
      }
    } catch {
      /* error surfaces via extractErrorMessage(requestState.error) */
    }
  };

  const onSendOtp = async (): Promise<void> => {
    if (!channel) return;
    try {
      await sendOtp({ username, channel }).unwrap();
      startCooldown();
      setStep('otp');
    } catch {
      /* error surfaces via extractErrorMessage(sendOtpState.error) */
    }
  };

  const onResend = async (): Promise<void> => {
    if (!channel || cooldown > 0) return;
    try {
      await sendOtp({ username, channel }).unwrap();
      startCooldown();
      setOtp('');
    } catch {
      /* error surfaces via extractErrorMessage(sendOtpState.error) */
    }
  };

  const onVerifyOtp = async (e: FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault();
    if (!channel) return;
    try {
      const res = await verifyOtp({ username, channel, otp }).unwrap();
      setResetToken(res.resetToken);
      setStep('reset');
    } catch {
      /* error surfaces via extractErrorMessage(verifyOtpState.error) */
    }
  };

  const onResetPassword = async (e: FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault();
    try {
      await resetPassword({ resetToken, password, confirmPassword }).unwrap();
      setStep('done');
      setTimeout(() => navigate('/login'), 3000);
    } catch {
      /* error surfaces via extractErrorMessage(resetState.error) */
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#EEF1F6] p-4 sm:p-6 lg:p-10">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-2xl sm:p-10">
        <h2 className="text-2xl font-extrabold text-[#111827]">Forgot Password</h2>
        <p className="mt-2 text-sm text-[#6B7280]">
          {step === 'identify' && 'Enter your username to begin recovering your account.'}
          {step === 'method' && 'Choose how you want to receive your verification code.'}
          {step === 'pending' && 'Your account requires approval before a code can be sent.'}
          {step === 'otp' && selfService && `Enter the 6-digit code sent to your ${channel === 'email' ? 'email' : 'mobile number'}.`}
          {step === 'otp' && !selfService && 'Enter the 6-digit code your approver received on your behalf.'}
          {step === 'reset' && 'Choose a new password for your account.'}
          {step === 'done' && 'Your password has been updated.'}
        </p>

        {step === 'identify' ? (
          <form className="mt-6 space-y-4" onSubmit={onIdentifySubmit}>
            <label className="grid gap-1.5 text-xs font-semibold text-[#374151]">
              Username
              <Input
                autoComplete="username"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className={inputClassName}
              />
            </label>
            {notFoundMessage ? (
              <p className="rounded-xl border border-[#FCA5A5] bg-[#FEF2F2] px-4 py-2.5 text-xs font-medium text-[#B91C1C]" role="alert">
                {notFoundMessage}
              </p>
            ) : null}
            {extractErrorMessage(requestState.error ?? createRequestState.error) ? (
              <p className="rounded-xl border border-[#FCA5A5] bg-[#FEF2F2] px-4 py-2.5 text-xs font-medium text-[#B91C1C]" role="alert">
                {extractErrorMessage(requestState.error ?? createRequestState.error)}
              </p>
            ) : null}
            <Button
              type="submit"
              className={`w-full ${primaryButtonClassName}`}
              disabled={requestState.isLoading || createRequestState.isLoading}
            >
              {requestState.isLoading || createRequestState.isLoading ? 'Checking…' : 'Continue'}
            </Button>
            <Link to="/login" className="block text-center text-[12.5px] font-semibold text-[#1D4ED8] hover:underline">
              ← Back to login
            </Link>
          </form>
        ) : null}

        {step === 'method' ? (
          <div className="mt-6 space-y-4">
            <div className="space-y-2">
              {maskedEmail ? (
                <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-[#D1D5DB] px-4 py-3 text-sm has-[:checked]:border-[#1D4ED8] has-[:checked]:bg-[#EFF6FF]">
                  <input
                    type="radio"
                    name="channel"
                    checked={channel === 'email'}
                    onChange={() => setChannel('email')}
                  />
                  <span>
                    Send OTP to Registered Email
                    <br />
                    <span className="text-[#6B7280]">{maskedEmail}</span>
                  </span>
                </label>
              ) : null}
              {maskedMobile ? (
                <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-[#D1D5DB] px-4 py-3 text-sm has-[:checked]:border-[#1D4ED8] has-[:checked]:bg-[#EFF6FF]">
                  <input
                    type="radio"
                    name="channel"
                    checked={channel === 'mobile'}
                    onChange={() => setChannel('mobile')}
                  />
                  <span>
                    Send OTP to Registered Mobile Number
                    <br />
                    <span className="text-[#6B7280]">{maskedMobile}</span>
                  </span>
                </label>
              ) : null}
            </div>
            {extractErrorMessage(sendOtpState.error) ? (
              <p className="rounded-xl border border-[#FCA5A5] bg-[#FEF2F2] px-4 py-2.5 text-xs font-medium text-[#B91C1C]" role="alert">
                {extractErrorMessage(sendOtpState.error)}
              </p>
            ) : null}
            <div className="flex items-center gap-2">
              <Button
                type="button"
                onClick={onSendOtp}
                className={`flex-1 ${primaryButtonClassName}`}
                disabled={sendOtpState.isLoading || !channel}
              >
                {sendOtpState.isLoading ? 'Sending…' : 'Send OTP'}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => setStep('identify')}
                className={secondaryButtonClassName}
              >
                ← Back
              </Button>
            </div>
          </div>
        ) : null}

        {step === 'pending' ? (
          <div className="mt-6 space-y-4">
            <p className="rounded-xl border border-[#BFDBFE] bg-[#EFF6FF] px-4 py-3 text-sm text-[#1E3A5F]">
              Self-service password reset isn&rsquo;t permitted for your role, and no {approverRolesLabel || 'authorised approver'}{' '}
              currently has contact info on file to receive a verification code on your behalf. Please contact your
              administrator directly.
            </p>
            <Link to="/login" className="block text-center text-[12.5px] font-semibold text-[#1D4ED8] hover:underline">
              ← Back to login
            </Link>
          </div>
        ) : null}

        {step === 'otp' ? (
          <form className="mt-6 space-y-4" onSubmit={onVerifyOtp}>
            {!selfService ? (
              <p className="rounded-xl border border-[#BFDBFE] bg-[#EFF6FF] px-4 py-2.5 text-[11.5px] text-[#1E3A5F]">
                A verification code was sent to {approverRolesLabel || 'an authorised approver'}. Ask them for it
                after they&rsquo;ve verified your identity.
              </p>
            ) : null}
            <label className="grid gap-1.5 text-xs font-semibold text-[#374151]">
              Verification code
              <Input
                inputMode="numeric"
                autoComplete="one-time-code"
                required
                maxLength={6}
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                className={inputClassName}
              />
            </label>
            {extractErrorMessage(verifyOtpState.error) ? (
              <p className="rounded-xl border border-[#FCA5A5] bg-[#FEF2F2] px-4 py-2.5 text-xs font-medium text-[#B91C1C]" role="alert">
                {extractErrorMessage(verifyOtpState.error)}
              </p>
            ) : null}
            <Button
              type="submit"
              className={`w-full ${primaryButtonClassName}`}
              disabled={verifyOtpState.isLoading || otp.length !== 6}
            >
              {verifyOtpState.isLoading ? 'Verifying…' : 'Verify code'}
            </Button>
            <div className="flex items-center justify-between text-[12.5px]">
              <button
                type="button"
                onClick={onResend}
                disabled={cooldown > 0 || sendOtpState.isLoading}
                className="font-semibold text-[#1D4ED8] hover:underline disabled:cursor-not-allowed disabled:text-[#9CA3AF] disabled:no-underline"
              >
                {cooldown > 0 ? `Resend code in ${cooldown}s` : 'Resend code'}
              </button>
              {selfService ? (
                <button
                  type="button"
                  onClick={() => setStep('method')}
                  className="font-semibold text-[#6B7280] hover:underline"
                >
                  ← Change method
                </button>
              ) : null}
            </div>
            <button
              type="button"
              onClick={() => setStep('identify')}
              className="block text-[12.5px] font-semibold text-[#6B7280] hover:underline"
            >
              ← Back
            </button>
          </form>
        ) : null}

        {step === 'reset' ? (
          <form className="mt-6 space-y-4" onSubmit={onResetPassword}>
            <label className="grid gap-1.5 text-xs font-semibold text-[#374151]">
              New password
              <Input
                type="password"
                autoComplete="new-password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={inputClassName}
              />
            </label>
            <label className="grid gap-1.5 text-xs font-semibold text-[#374151]">
              Confirm password
              <Input
                type="password"
                autoComplete="new-password"
                required
                minLength={8}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className={inputClassName}
              />
            </label>
            {password.length > 0 && password.length < 8 ? (
              <p className="text-xs font-medium text-[#B91C1C]">Password must be at least 8 characters.</p>
            ) : null}
            {confirmPassword.length > 0 && password !== confirmPassword ? (
              <p className="text-xs font-medium text-[#B91C1C]">Passwords do not match.</p>
            ) : null}
            {extractErrorMessage(resetState.error) ? (
              <p className="rounded-xl border border-[#FCA5A5] bg-[#FEF2F2] px-4 py-2.5 text-xs font-medium text-[#B91C1C]" role="alert">
                {extractErrorMessage(resetState.error)}
              </p>
            ) : null}
            <Button
              type="submit"
              className={`w-full ${primaryButtonClassName}`}
              disabled={resetState.isLoading || password.length < 8 || password !== confirmPassword}
            >
              {resetState.isLoading ? 'Updating…' : 'Reset password'}
            </Button>
          </form>
        ) : null}

        {step === 'done' ? (
          <div className="mt-6 space-y-4">
            <p className="rounded-xl border border-[#BBF7D0] bg-[#F0FDF4] px-4 py-3 text-sm font-medium text-[#166534]">
              Password updated successfully. You&rsquo;ve been signed out of all devices — redirecting you to login…
            </p>
            <Link to="/login" className={`block w-full text-center text-white ${primaryButtonClassName} py-3`}>
              Go to login now
            </Link>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function extractErrorMessage(error: unknown): string | null {
  if (!error || typeof error !== 'object') return null;
  const anyErr = error as { status?: number; data?: { error?: { message?: string } } };
  if (anyErr.status === 429) return 'Too many attempts. Please wait a while before trying again.';
  return anyErr.data?.error?.message ?? 'Something went wrong. Please try again.';
}

import { useState, useContext, useEffect, useRef } from 'react';
import { AuthContext } from '../context/AuthContext';
import { useNavigate, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Mail, 
  Lock, 
  ArrowRight, 
  ArrowLeft,
  RefreshCw, 
  CheckCircle2, 
  AlertCircle, 
  Eye, 
  EyeOff, 
  LogIn, 
  UserPlus, 
  KeyRound,
  ShieldCheck,
  Check,
  X,
  Clock
} from 'lucide-react';

const LoginPage = () => {
  // Main Tab: 'signin' | 'signup' | 'forgot'
  const [activeTab, setActiveTab] = useState<'signin' | 'signup' | 'forgot'>('signin');

  // Sign In Form State
  const [signInEmail, setSignInEmail] = useState('');
  const [signInPassword, setSignInPassword] = useState('');
  const [showSignInPassword, setShowSignInPassword] = useState(false);
  const [isLocked, setIsLocked] = useState(false);
  const [lockoutRemainingSeconds, setLockoutRemainingSeconds] = useState(0);

  // Forgot Password Multi-Step State
  // Step 1 = Enter Email
  // Step 2 = Enter 6-digit Verification Code
  // Step 3 = Create New Password (8 chars, 1 uppercase, 1 number)
  // Step 4 = Success Confirmation View
  const [forgotStep, setForgotStep] = useState<1 | 2 | 3 | 4>(1);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotOtpCode, setForgotOtpCode] = useState(['', '', '', '', '', '']);
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const forgotOtpInputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Sign Up Multi-step State
  // Step 1 = Enter Full Name & Email + Privacy Policy Check
  // Step 2 = Enter 6-digit Verification Code
  // Step 3 = Create Password (8 chars, 1 uppercase, 1 number)
  const [signUpStep, setSignUpStep] = useState<1 | 2 | 3>(1);
  const [signUpEmail, setSignUpEmail] = useState('');
  const [signUpName, setSignUpName] = useState('');
  const [agreedToPrivacy, setAgreedToPrivacy] = useState(false);
  const [showPrivacyModal, setShowPrivacyModal] = useState(false);
  const [otpCode, setOtpCode] = useState(['', '', '', '', '', '']);
  const [signUpPassword, setSignUpPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showSignUpPassword, setShowSignUpPassword] = useState(false);

  // Status & Feedback States
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [infoMsg, setInfoMsg] = useState('');
  const [resendCooldown, setResendCooldown] = useState(0);

  const { 
    login, 
    sendSignUpCode, 
    verifySignUpCode, 
    completeSignUp,
    checkAccountExists,
    sendResetCode,
    verifyResetCode,
    resetPassword
  } = useContext(AuthContext) as any;
  const navigate = useNavigate();
  const location = useLocation();
  const from = location.state?.from?.pathname || null;

  const otpInputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Format lockout countdown time (e.g., "9m 42s" or "25s")
  const formatLockoutTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    if (mins > 0) {
      return `${mins}m ${secs.toString().padStart(2, '0')}s`;
    }
    return `${secs}s`;
  };

  // Live countdown for login lockout
  useEffect(() => {
    if (lockoutRemainingSeconds <= 0) {
      if (isLocked) {
        setIsLocked(false);
      }
      return;
    }

    const timer = setInterval(() => {
      setLockoutRemainingSeconds((prev) => {
        if (prev <= 1) {
          setIsLocked(false);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [lockoutRemainingSeconds, isLocked]);

  // Timer countdown for resending OTP
  useEffect(() => {
    if (resendCooldown > 0) {
      const timer = setTimeout(() => setResendCooldown(c => c - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [resendCooldown]);

  const handleRedirect = (user: any) => {
    if (from) {
      navigate(from);
    } else if (user?.role === 'admin') {
      navigate('/dashboard');
    } else {
      navigate('/menu');
    }
  };

  // General Email Validator (supports institutional, custom, and standard domains like @sorsu.edu.ph, @gmail.com, etc.)
  const isValidEmail = (email: string) => {
    return /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9]+([.-][a-zA-Z0-9]+)*\.[a-zA-Z]{2,}$/i.test(email.trim());
  };

  // Full Name Validator:
  // - Required, max 50 characters
  // - Rejects numbers
  // - Rejects names made entirely of symbols
  // - Allows valid names containing letters, spaces, hyphens, and apostrophes
  const validateFullName = (name: unknown): { isValid: boolean; error?: string } => {
    if (typeof name !== 'string') {
      return { isValid: false, error: 'Full Name is required.' };
    }
    const cleanName = name.trim();
    if (!cleanName) {
      return { isValid: false, error: 'Full Name is required.' };
    }
    if (cleanName.length > 50) {
      return { isValid: false, error: 'Full Name cannot exceed 50 characters.' };
    }
    if (/[0-9]/.test(cleanName)) {
      return { isValid: false, error: 'Full Name must not contain numbers.' };
    }
    if (!/[a-zA-Z\u00C0-\u024F\u1E00-\u1EFF]/.test(cleanName)) {
      return { isValid: false, error: 'Full Name cannot be made entirely of symbols.' };
    }
    if (!/^[a-zA-Z\u00C0-\u024F\u1E00-\u1EFF\s'-]+$/.test(cleanName)) {
      return { isValid: false, error: 'Full Name can only contain letters, spaces, hyphens, and apostrophes.' };
    }
    return { isValid: true };
  };

  // Password Rules Validation (Sign Up):
  // 1. Total length at least 8 characters
  // 2. Contains at least 1 uppercase letter
  // 3. Contains at least 1 number
  const passwordRules = {
    minEightChars: signUpPassword.length >= 8,
    hasUppercase: /[A-Z]/.test(signUpPassword),
    hasNumber: /[0-9]/.test(signUpPassword),
    passwordsMatch: signUpPassword.length > 0 && signUpPassword === confirmPassword
  };

  const isPasswordFullyValid = 
    passwordRules.minEightChars && 
    passwordRules.hasUppercase && 
    passwordRules.hasNumber;

  // Password Rules Validation (Password Reset):
  const resetPasswordRules = {
    minEightChars: newPassword.length >= 8,
    hasUppercase: /[A-Z]/.test(newPassword),
    hasNumber: /[0-9]/.test(newPassword),
    passwordsMatch: newPassword.length > 0 && newPassword === confirmNewPassword
  };

  const isResetPasswordFullyValid = 
    resetPasswordRules.minEightChars && 
    resetPasswordRules.hasUppercase && 
    resetPasswordRules.hasNumber;

  // -------------------------------------------------------------
  // FORGOT PASSWORD HANDLERS
  // -------------------------------------------------------------
  const handleStartForgotPassword = () => {
    setActiveTab('forgot');
    setForgotStep(1);
    if (signInEmail.trim()) {
      setForgotEmail(signInEmail.trim());
    }
    setForgotOtpCode(['', '', '', '', '', '']);
    setNewPassword('');
    setConfirmNewPassword('');
    setError('');
    setInfoMsg('');
  };

  const handleSendResetVerificationCode = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setError('');
    setInfoMsg('');

    const cleanEmail = forgotEmail.trim().toLowerCase();
    if (!cleanEmail) {
      setError('Please enter your email address.');
      return;
    }

    if (!isValidEmail(cleanEmail)) {
      setError('Please enter a valid email address.');
      return;
    }

    setLoading(true);
    try {
      // Step 2: Verify that the account exists
      const check = await checkAccountExists(cleanEmail);
      if (!check.exists) {
        setError(check.error || 'No account was found with this email address.');
        setLoading(false);
        return;
      }

      // Step 3: Send verification code via Brevo
      const res = await sendResetCode(cleanEmail);
      setForgotStep(2);
      setResendCooldown(60);
      setInfoMsg(res.message || `A 6-digit verification code has been sent to ${cleanEmail}. Please check your inbox.`);
      setTimeout(() => {
        forgotOtpInputRefs.current[0]?.focus();
      }, 100);
    } catch (err: any) {
      setError(err.message || 'No account was found with this email address.');
    } finally {
      setLoading(false);
    }
  };

  const handleForgotOtpChange = (index: number, value: string) => {
    if (value.length > 1) {
      const digits = value.replace(/\D/g, '').slice(0, 6).split('');
      const newOtp = [...forgotOtpCode];
      digits.forEach((d, i) => {
        if (index + i < 6) newOtp[index + i] = d;
      });
      setForgotOtpCode(newOtp);
      const nextIndex = Math.min(index + digits.length, 5);
      forgotOtpInputRefs.current[nextIndex]?.focus();
      return;
    }

    const digit = value.replace(/\D/g, '');
    const newOtp = [...forgotOtpCode];
    newOtp[index] = digit;
    setForgotOtpCode(newOtp);

    if (digit && index < 5) {
      forgotOtpInputRefs.current[index + 1]?.focus();
    }
  };

  const handleForgotOtpKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !forgotOtpCode[index] && index > 0) {
      forgotOtpInputRefs.current[index - 1]?.focus();
    }
  };

  // Step 4: Verify the code
  const handleVerifyResetCode = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setError('');
    setInfoMsg('');

    const fullCode = forgotOtpCode.join('').trim();
    if (fullCode.length !== 6) {
      setError('Please enter all 6 digits of the verification code.');
      return;
    }

    setLoading(true);
    try {
      await verifyResetCode(forgotEmail, fullCode);
      setInfoMsg('Code verified! You can now create your new password.');
      setForgotStep(3);
    } catch (err: any) {
      setError(err.message || 'Invalid or expired verification code. Please check and try again.');
    } finally {
      setLoading(false);
    }
  };

  // Step 5 & 6: Create New Password & Update Existing Account
  const handleResetPasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setInfoMsg('');

    if (!isResetPasswordFullyValid) {
      setError('Password must contain at least 8 characters, 1 uppercase letter, and 1 number.');
      return;
    }

    if (newPassword !== confirmNewPassword) {
      setError('Passwords do not match. Please re-enter.');
      return;
    }

    setLoading(true);
    try {
      await resetPassword(forgotEmail, newPassword);
      setForgotStep(4);
    } catch (err: any) {
      setError(err.message || 'Failed to update password. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Step 7: Back to Sign In
  const handleBackToSignInAfterReset = () => {
    setActiveTab('signin');
    setSignInEmail(forgotEmail);
    setSignInPassword('');
    setError('');
    setInfoMsg('Your password has been successfully changed. Please sign in with your new password.');
  };

  // -------------------------------------------------------------
  // SIGN IN HANDLER
  // -------------------------------------------------------------
  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setInfoMsg('');

    if (isLocked && lockoutRemainingSeconds > 0) {
      setError(`Too many failed sign-in attempts. Your sign-in is temporarily locked for security.`);
      return;
    }

    const cleanEmail = signInEmail.trim();
    if (!cleanEmail) {
      setError('Please enter your email address.');
      return;
    }

    if (!signInPassword) {
      setError('Please enter your password.');
      return;
    }

    setLoading(true);
    try {
      const user = await login(cleanEmail, signInPassword);
      handleRedirect(user);
    } catch (err: any) {
      if (err.isLocked || err.status === 429) {
        setIsLocked(true);
        const remSec = typeof err.remainingSeconds === 'number' && err.remainingSeconds > 0 ? err.remainingSeconds : 600;
        setLockoutRemainingSeconds(remSec);
        setError(err.message || 'Too many failed sign-in attempts. Your sign-in is temporarily locked for security.');
      } else {
        setError(err.message || 'Invalid email or password.');
      }
    } finally {
      setLoading(false);
    }
  };

  // -------------------------------------------------------------
  // SIGN UP - STEP 1: Send Verification Code
  // -------------------------------------------------------------
  const handleSendVerificationCode = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setError('');
    setInfoMsg('');

    const nameCheck = validateFullName(signUpName);
    if (!nameCheck.isValid) {
      setError(nameCheck.error || 'Invalid Full Name.');
      return;
    }

    const cleanName = signUpName.trim();
    const cleanEmail = signUpEmail.trim().toLowerCase();
    if (!cleanEmail) {
      setError('Please enter your email address.');
      return;
    }

    if (!isValidEmail(cleanEmail)) {
      setError('Please enter a valid email address.');
      return;
    }

    if (!agreedToPrivacy) {
      setError('You must agree to the Privacy Policy before proceeding.');
      return;
    }

    setLoading(true);
    try {
      const res = await sendSignUpCode(cleanEmail, cleanName);
      setSignUpStep(2);
      setResendCooldown(60);
      setInfoMsg(res.message || `A 6-digit verification code has been sent to your email (${cleanEmail}). Please check your inbox.`);
      setTimeout(() => {
        otpInputRefs.current[0]?.focus();
      }, 100);
    } catch (err: any) {
      setError(err.message || 'Failed to send verification code. Please check your network.');
    } finally {
      setLoading(false);
    }
  };

  // -------------------------------------------------------------
  // SIGN UP - STEP 2: Verify 6-Digit Code
  // -------------------------------------------------------------
  const handleOtpChange = (index: number, value: string) => {
    if (value.length > 1) {
      const digits = value.replace(/\D/g, '').slice(0, 6).split('');
      const newOtp = [...otpCode];
      digits.forEach((d, i) => {
        if (index + i < 6) newOtp[index + i] = d;
      });
      setOtpCode(newOtp);
      const nextIndex = Math.min(index + digits.length, 5);
      otpInputRefs.current[nextIndex]?.focus();
      return;
    }

    const digit = value.replace(/\D/g, '');
    const newOtp = [...otpCode];
    newOtp[index] = digit;
    setOtpCode(newOtp);

    if (digit && index < 5) {
      otpInputRefs.current[index + 1]?.focus();
    }
  };

  const handleOtpKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !otpCode[index] && index > 0) {
      otpInputRefs.current[index - 1]?.focus();
    }
  };

  const handleVerifyCode = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setError('');
    setInfoMsg('');

    const fullCode = otpCode.join('').trim();
    if (fullCode.length !== 6) {
      setError('Please enter all 6 digits of the verification code.');
      return;
    }

    setLoading(true);
    try {
      await verifySignUpCode(signUpEmail, fullCode);
      setInfoMsg('Code verified! You can now create your password.');
      setSignUpStep(3);
    } catch (err: any) {
      setError(err.message || 'Invalid or expired verification code.');
    } finally {
      setLoading(false);
    }
  };

  // -------------------------------------------------------------
  // SIGN UP - STEP 3: Create Password & Complete Registration
  // -------------------------------------------------------------
  const handleCompleteSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setInfoMsg('');

    const nameCheck = validateFullName(signUpName);
    if (!nameCheck.isValid) {
      setError(nameCheck.error || 'Invalid Full Name.');
      return;
    }

    if (!isPasswordFullyValid) {
      setError('Password must contain at least 8 characters, 1 uppercase letter, and 1 number.');
      return;
    }

    if (signUpPassword !== confirmPassword) {
      setError('Passwords do not match. Please re-enter.');
      return;
    }

    setLoading(true);
    try {
      const user = await completeSignUp(signUpEmail, signUpPassword, signUpName);
      handleRedirect(user);
    } catch (err: any) {
      setError(err.message || 'Failed to complete registration.');
    } finally {
      setLoading(false);
    }
  };

  const resetSignUpFlow = () => {
    setSignUpStep(1);
    setOtpCode(['', '', '', '', '', '']);
    setSignUpPassword('');
    setConfirmPassword('');
    setError('');
    setInfoMsg('');
  };

  return (
    <div className="min-h-[80vh] flex items-center justify-center p-4 sm:p-6">
      <div className="bg-white rounded-xl w-full max-w-md border border-gray-200 overflow-hidden">
        
        {/* Navigation Tabs (Sign In / Sign Up) */}
        <div className="flex border-b border-gray-200 bg-gray-50 p-1.5 gap-1.5">
          <button 
            type="button"
            id="tab-signin"
            onClick={() => { 
              setActiveTab('signin'); 
              setError(''); 
              setInfoMsg(''); 
            }}
            className={`flex-1 py-2.5 px-4 rounded-lg font-bold text-xs uppercase tracking-wider transition-colors flex items-center justify-center gap-2 ${
              activeTab === 'signin' 
                ? 'bg-white text-dark border border-gray-200' 
                : 'text-gray-500 hover:text-dark'
            }`}
          >
            <LogIn size={15} className={activeTab === 'signin' ? 'text-primary' : ''} />
            Sign In
          </button>
          
          <button 
            type="button"
            id="tab-signup"
            onClick={() => { 
              setActiveTab('signup'); 
              resetSignUpFlow();
            }}
            className={`flex-1 py-2.5 px-4 rounded-lg font-bold text-xs uppercase tracking-wider transition-colors flex items-center justify-center gap-2 ${
              activeTab === 'signup' 
                ? 'bg-white text-dark border border-gray-200' 
                : 'text-gray-500 hover:text-dark'
            }`}
          >
            <UserPlus size={15} className={activeTab === 'signup' ? 'text-primary' : ''} />
            Sign Up
          </button>
        </div>

        <div className="p-6 sm:p-8">
          
          {/* Alerts & Notifications */}
          <AnimatePresence>
            {error && (
              <motion.div 
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                className="bg-red-50 text-red-700 p-3.5 rounded-lg mb-5 text-xs font-bold border border-red-200 flex items-start gap-2.5"
              >
                <AlertCircle size={16} className="shrink-0 mt-0.5" />
                <div className="space-y-1.5 flex-1">
                  <p className="leading-relaxed">{error}</p>
                  {isLocked && lockoutRemainingSeconds > 0 && (
                    <div className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-red-100/90 border border-red-300 rounded-md text-red-800 font-extrabold text-[11px]">
                      <Clock size={12} className="shrink-0 text-red-600" />
                      <span>Try again in {formatLockoutTime(lockoutRemainingSeconds)}</span>
                    </div>
                  )}
                </div>
              </motion.div>
            )}
            
            {infoMsg && (
              <motion.div 
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                className="bg-green-50 text-green-800 p-3.5 rounded-lg mb-5 text-xs font-bold border border-green-200 flex items-start gap-2.5"
              >
                <CheckCircle2 size={16} className="shrink-0 mt-0.5 text-green-600" />
                <div className="flex-1">
                  <p className="leading-relaxed">{infoMsg}</p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* ================================================================= */}
          {/* SIGN IN TAB */}
          {/* ================================================================= */}
          {activeTab === 'signin' && (
            <div>
              <div className="flex flex-col items-center text-center mb-6">
                <h2 className="text-2xl font-black text-dark tracking-tight">
                  Welcome Back
                </h2>
                <p className="text-gray-500 text-xs mt-1">
                  Sign in with your registered email address and password
                </p>
              </div>

              <form onSubmit={handleSignIn} className="space-y-4">
                {/* Enter Email */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-gray-700 uppercase tracking-wider">
                    Email Address
                  </label>
                  <div className="relative group">
                    <Mail size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-dark transition-colors" />
                    <input 
                      type="email" 
                      id="signin-email-input"
                      value={signInEmail}
                      onChange={(e) => setSignInEmail(e.target.value)}
                      placeholder="yourname@example.com"
                      className="w-full bg-white border border-gray-300 p-2.5 pl-10 rounded-lg focus:outline-none focus:border-dark transition-colors font-medium text-dark text-sm placeholder:text-gray-400"
                      required
                      autoFocus
                    />
                  </div>
                </div>

                {/* Enter Password */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-gray-700 uppercase tracking-wider">
                    Password
                  </label>
                  <div className="relative group">
                    <Lock size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-dark transition-colors" />
                    <input 
                      type={showSignInPassword ? 'text' : 'password'}
                      id="signin-password-input"
                      value={signInPassword}
                      onChange={(e) => setSignInPassword(e.target.value)}
                      placeholder={isLocked && lockoutRemainingSeconds > 0 ? "Sign-in locked temporarily" : "Enter your password"}
                      disabled={isLocked && lockoutRemainingSeconds > 0}
                      className="w-full bg-white border border-gray-300 p-2.5 pl-10 pr-10 rounded-lg focus:outline-none focus:border-dark transition-colors font-medium text-dark text-sm placeholder:text-gray-400 disabled:bg-gray-100 disabled:text-gray-400 disabled:cursor-not-allowed"
                      required
                    />
                    <button 
                      type="button"
                      onClick={() => setShowSignInPassword(!showSignInPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-dark transition-colors"
                      tabIndex={-1}
                    >
                      {showSignInPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                  {/* Forgot Password Link directly below the Password field */}
                  <div className="flex justify-end pt-1">
                    <button 
                      type="button"
                      id="forgot-password-link"
                      onClick={handleStartForgotPassword}
                      className="text-primary hover:text-orange-700 underline text-xs font-semibold cursor-pointer transition-colors"
                    >
                      Forgot Password?
                    </button>
                  </div>
                </div>

                <button 
                  type="submit" 
                  id="signin-submit-btn"
                  disabled={loading || (isLocked && lockoutRemainingSeconds > 0)}
                  className="w-full bg-dark text-white py-3 rounded-lg hover:bg-primary font-bold text-xs uppercase tracking-wider transition-colors mt-4 active:translate-y-0.5 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                >
                  {loading ? (
                    <RefreshCw size={16} className="animate-spin" />
                  ) : isLocked && lockoutRemainingSeconds > 0 ? (
                    <>
                      <Lock size={14} />
                      <span>Locked ({formatLockoutTime(lockoutRemainingSeconds)})</span>
                    </>
                  ) : (
                    <>
                      <span>Sign In</span>
                      <ArrowRight size={14} />
                    </>
                  )}
                </button>
              </form>

              <div className="mt-6 text-center border-t border-gray-100 pt-4">
                <p className="text-xs text-gray-500">
                  Don't have an account yet?{' '}
                  <button 
                    type="button"
                    onClick={() => { setActiveTab('signup'); resetSignUpFlow(); }}
                    className="font-bold text-dark hover:text-primary transition-colors ml-1"
                  >
                    Create Account
                  </button>
                </p>
              </div>
            </div>
          )}

          {/* ================================================================= */}
          {/* SIGN UP TAB (Multi-Step Flow) */}
          {/* ================================================================= */}
          {activeTab === 'signup' && (
            <div>
              {/* Progress Indicator */}
              <div className="mb-6">
                <div className="flex items-center justify-between relative mb-2">
                  <div className="absolute left-0 top-1/2 -translate-y-1/2 h-0.5 bg-gray-200 w-full -z-0"></div>
                  <div 
                    className="absolute left-0 top-1/2 -translate-y-1/2 h-0.5 bg-dark transition-all duration-300 -z-0"
                    style={{ width: signUpStep === 1 ? '0%' : signUpStep === 2 ? '50%' : '100%' }}
                  ></div>

                  {/* Step 1 Pill */}
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold z-10 transition-colors ${
                    signUpStep >= 1 ? 'bg-dark text-white' : 'bg-gray-200 text-gray-500'
                  }`}>
                    {signUpStep > 1 ? <Check size={13} /> : '1'}
                  </div>

                  {/* Step 2 Pill */}
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold z-10 transition-colors ${
                    signUpStep >= 2 ? 'bg-dark text-white' : 'bg-gray-200 text-gray-500'
                  }`}>
                    {signUpStep > 2 ? <Check size={13} /> : '2'}
                  </div>

                  {/* Step 3 Pill */}
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold z-10 transition-colors ${
                    signUpStep === 3 ? 'bg-dark text-white' : 'bg-gray-200 text-gray-500'
                  }`}>
                    3
                  </div>
                </div>

                <div className="flex justify-between text-[10px] font-bold uppercase tracking-wider text-gray-500 px-0.5">
                  <span>1. Details</span>
                  <span>2. Verify</span>
                  <span>3. Password</span>
                </div>
              </div>

              {/* ------------------------------------------------------------- */}
              {/* SIGN UP STEP 1: Enter Full Name, Email & Privacy Agreement */}
              {/* ------------------------------------------------------------- */}
              {signUpStep === 1 && (
                <div>
                  <div className="text-center mb-5">
                    <h3 className="text-xl font-black text-dark tracking-tight">Create Account</h3>
                    <p className="text-gray-500 text-xs mt-0.5">Enter your full name and valid email address</p>
                  </div>

                  <form onSubmit={handleSendVerificationCode} className="space-y-4">
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-gray-700 uppercase tracking-wider">
                        Full Name <span className="text-primary">*</span>
                      </label>
                      <input 
                        type="text" 
                        id="signup-name-input"
                        value={signUpName}
                        maxLength={50}
                        onChange={(e) => {
                          setSignUpName(e.target.value.slice(0, 50));
                          if (error) setError('');
                        }}
                        placeholder="e.g. Juan Dela Cruz"
                        className="w-full bg-white border border-gray-300 p-2.5 rounded-lg focus:outline-none focus:border-dark transition-colors font-medium text-dark text-sm placeholder:text-gray-400"
                        required
                        autoFocus
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-gray-700 uppercase tracking-wider">
                        Email Address <span className="text-primary">*</span>
                      </label>
                      <div className="relative group">
                        <Mail size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-dark transition-colors" />
                        <input 
                          type="email" 
                          id="signup-email-input"
                          value={signUpEmail}
                          onChange={(e) => setSignUpEmail(e.target.value)}
                          placeholder="yourname@example.com"
                          className="w-full bg-white border border-gray-300 p-2.5 pl-10 rounded-lg focus:outline-none focus:border-dark transition-colors font-medium text-dark text-sm placeholder:text-gray-400"
                          required
                        />
                      </div>
                      <p className="text-[11px] text-gray-500">Must be a valid email address (e.g. name@example.com)</p>
                    </div>

                    {/* Privacy Policy Checkbox */}
                    <div className="flex items-start gap-2.5 pt-2">
                      <input
                        type="checkbox"
                        id="privacy-policy-checkbox"
                        checked={agreedToPrivacy}
                        onChange={(e) => setAgreedToPrivacy(e.target.checked)}
                        className="mt-0.5 h-4 w-4 rounded border-gray-300 text-dark focus:ring-dark cursor-pointer shrink-0"
                        required
                      />
                      <label htmlFor="privacy-policy-checkbox" className="text-xs text-gray-600 leading-relaxed cursor-pointer select-none">
                        I agree to the{' '}
                        <button
                          type="button"
                          onClick={() => setShowPrivacyModal(true)}
                          className="text-primary font-bold hover:underline inline"
                        >
                          Privacy Policy
                        </button>{' '}
                        and consent to the processing of my information for verification and orders.
                      </label>
                    </div>

                    <button 
                      type="submit" 
                      id="signup-sendcode-btn"
                      disabled={loading || !agreedToPrivacy || !signUpName.trim() || !signUpEmail.trim()}
                      className="w-full bg-dark text-white py-3 rounded-lg hover:bg-primary font-bold text-xs uppercase tracking-wider transition-colors mt-4 active:translate-y-0.5 flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                      {loading ? (
                        <>
                          <RefreshCw size={16} className="animate-spin" />
                          <span>Sending Code to Email...</span>
                        </>
                      ) : (
                        <>
                          <span>Send Verification Code</span>
                          <ArrowRight size={14} />
                        </>
                      )}
                    </button>
                  </form>
                </div>
              )}

              {/* ------------------------------------------------------------- */}
              {/* SIGN UP STEP 2: Enter Verification Code */}
              {/* ------------------------------------------------------------- */}
              {signUpStep === 2 && (
                <div>
                  <div className="text-center mb-5">
                    <h3 className="text-xl font-black text-dark tracking-tight">Enter Verification Code</h3>
                    <p className="text-gray-500 text-xs mt-0.5">
                      Sent to <strong className="text-dark">{signUpEmail}</strong>
                    </p>
                  </div>

                  <form onSubmit={handleVerifyCode} className="space-y-5">
                    <div>
                      <div className="flex justify-center gap-2">
                        {otpCode.map((digit, index) => (
                          <input
                            key={index}
                            ref={(el) => {
                              otpInputRefs.current[index] = el;
                            }}
                            type="text"
                            maxLength={6}
                            value={digit}
                            onChange={(e) => handleOtpChange(index, e.target.value)}
                            onKeyDown={(e) => handleOtpKeyDown(index, e)}
                            className="w-11 h-13 sm:w-12 sm:h-14 text-center text-xl font-black text-dark bg-white border border-gray-300 rounded-lg focus:border-dark transition-colors outline-none"
                            autoComplete="one-time-code"
                            inputMode="numeric"
                          />
                        ))}
                      </div>
                    </div>

                    <button 
                      type="submit" 
                      id="signup-verifycode-btn"
                      disabled={loading || otpCode.join('').length !== 6}
                      className="w-full bg-dark text-white py-3 rounded-lg hover:bg-primary font-bold text-xs uppercase tracking-wider transition-colors active:translate-y-0.5 flex items-center justify-center gap-2 disabled:opacity-40"
                    >
                      {loading ? (
                        <RefreshCw size={16} className="animate-spin" />
                      ) : (
                        <>
                          <ShieldCheck size={16} />
                          <span>Verify Code</span>
                        </>
                      )}
                    </button>

                    <div className="flex items-center justify-between text-xs pt-1">
                      <button
                        type="button"
                        onClick={() => { setSignUpStep(1); setError(''); }}
                        className="text-gray-500 hover:text-dark font-medium underline"
                      >
                        Change Email
                      </button>
                      
                      <button
                        type="button"
                        disabled={resendCooldown > 0 || loading}
                        onClick={() => handleSendVerificationCode()}
                        className="text-dark hover:text-primary font-bold disabled:text-gray-400"
                      >
                        {resendCooldown > 0 ? `Resend code (${resendCooldown}s)` : 'Resend code'}
                      </button>
                    </div>
                  </form>
                </div>
              )}

              {/* ------------------------------------------------------------- */}
              {/* SIGN UP STEP 3: Create Password */}
              {/* ------------------------------------------------------------- */}
              {signUpStep === 3 && (
                <div>
                  <div className="text-center mb-5">
                    <div className="w-10 h-10 bg-green-50 text-green-700 border border-green-200 rounded-lg flex items-center justify-center mx-auto mb-2">
                      <KeyRound size={18} />
                    </div>
                    <h3 className="text-xl font-black text-dark tracking-tight">Create Password</h3>
                    <p className="text-gray-500 text-xs mt-0.5">Set a secure password (minimum 8 characters) for {signUpEmail}</p>
                  </div>

                  <form onSubmit={handleCompleteSignUp} className="space-y-4">
                    {/* Password Input */}
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-gray-700 uppercase tracking-wider">
                        New Password (minimum 8 characters)
                      </label>
                      <div className="relative group">
                        <Lock size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-dark transition-colors" />
                        <input 
                          type={showSignUpPassword ? 'text' : 'password'}
                          id="signup-password-input"
                          value={signUpPassword}
                          onChange={(e) => setSignUpPassword(e.target.value)}
                          placeholder="e.g. Pass1234"
                          className="w-full bg-white border border-gray-300 p-2.5 pl-10 pr-10 rounded-lg focus:outline-none focus:border-dark transition-colors font-medium text-dark text-sm placeholder:text-gray-400"
                          required
                          autoFocus
                        />
                        <button 
                          type="button"
                          onClick={() => setShowSignUpPassword(!showSignUpPassword)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-dark transition-colors"
                          tabIndex={-1}
                        >
                          {showSignUpPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                        </button>
                      </div>
                    </div>

                    {/* Confirm Password Input */}
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-gray-700 uppercase tracking-wider">
                        Confirm Password
                      </label>
                      <div className="relative group">
                        <Lock size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-dark transition-colors" />
                        <input 
                          type={showSignUpPassword ? 'text' : 'password'}
                          id="signup-confirmpassword-input"
                          value={confirmPassword}
                          onChange={(e) => setConfirmPassword(e.target.value)}
                          placeholder="Re-enter password"
                          className="w-full bg-white border border-gray-300 p-2.5 pl-10 rounded-lg focus:outline-none focus:border-dark transition-colors font-medium text-dark text-sm placeholder:text-gray-400"
                          required
                        />
                      </div>
                    </div>

                    {/* Password Rules Live Checklist */}
                    <div className="bg-gray-50 p-3.5 rounded-lg border border-gray-200 space-y-1.5">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-gray-600">Password Requirements:</p>
                      <div className="space-y-1 text-xs font-medium">
                        <div className={`flex items-center gap-2 ${passwordRules.minEightChars ? 'text-green-700 font-bold' : 'text-gray-500'}`}>
                          {passwordRules.minEightChars ? <Check size={13} className="text-green-600" /> : <X size={13} className="text-gray-400" />}
                          <span>At least 8 characters</span>
                        </div>
                        <div className={`flex items-center gap-2 ${passwordRules.hasUppercase ? 'text-green-700 font-bold' : 'text-gray-500'}`}>
                          {passwordRules.hasUppercase ? <Check size={13} className="text-green-600" /> : <X size={13} className="text-gray-400" />}
                          <span>At least 1 uppercase / capital letter (A-Z)</span>
                        </div>
                        <div className={`flex items-center gap-2 ${passwordRules.hasNumber ? 'text-green-700 font-bold' : 'text-gray-500'}`}>
                          {passwordRules.hasNumber ? <Check size={13} className="text-green-600" /> : <X size={13} className="text-gray-400" />}
                          <span>At least 1 number (0-9)</span>
                        </div>
                        {confirmPassword.length > 0 && (
                          <div className={`flex items-center gap-2 ${passwordRules.passwordsMatch ? 'text-green-700 font-bold' : 'text-red-600 font-bold'}`}>
                            {passwordRules.passwordsMatch ? <Check size={13} className="text-green-600" /> : <X size={13} className="text-red-500" />}
                            <span>{passwordRules.passwordsMatch ? 'Passwords match' : 'Passwords do not match'}</span>
                          </div>
                        )}
                      </div>
                    </div>

                    <button 
                      type="submit" 
                      id="signup-complete-btn"
                      disabled={loading || !isPasswordFullyValid || signUpPassword !== confirmPassword}
                      className="w-full bg-dark text-white py-3 rounded-lg hover:bg-primary font-bold text-xs uppercase tracking-wider transition-colors mt-4 active:translate-y-0.5 flex items-center justify-center gap-2 disabled:opacity-40"
                    >
                      {loading ? (
                        <RefreshCw size={16} className="animate-spin" />
                      ) : (
                        <>
                          <CheckCircle2 size={16} />
                          <span>Create Account & Sign In</span>
                        </>
                      )}
                    </button>
                  </form>
                </div>
              )}

              <div className="mt-6 text-center border-t border-gray-100 pt-4">
                <p className="text-xs text-gray-500">
                  Already have an account?{' '}
                  <button 
                    type="button"
                    onClick={() => { setActiveTab('signin'); setError(''); }}
                    className="font-bold text-dark hover:text-primary transition-colors ml-1"
                  >
                    Sign In
                  </button>
                </p>
              </div>
            </div>
          )}

          {/* ================================================================= */}
          {/* FORGOT PASSWORD FLOW */}
          {/* ================================================================= */}
          {activeTab === 'forgot' && (
            <div>
              {/* Back to Sign In Link */}
              {forgotStep !== 4 && (
                <button
                  type="button"
                  id="forgot-back-to-signin-top"
                  onClick={() => { setActiveTab('signin'); setError(''); setInfoMsg(''); }}
                  className="inline-flex items-center gap-1.5 text-xs font-bold text-gray-500 hover:text-dark mb-4 transition-colors group"
                >
                  <ArrowLeft size={14} className="group-hover:-translate-x-0.5 transition-transform" />
                  <span>Back to Sign In</span>
                </button>
              )}

              {/* Progress Indicator for Forgot Password */}
              {forgotStep !== 4 && (
                <div className="mb-6">
                  <div className="flex items-center justify-between relative mb-2">
                    <div className="absolute left-0 top-1/2 -translate-y-1/2 h-0.5 bg-gray-200 w-full -z-0"></div>
                    <div 
                      className="absolute left-0 top-1/2 -translate-y-1/2 h-0.5 bg-primary transition-all duration-300 -z-0"
                      style={{ width: forgotStep === 1 ? '0%' : forgotStep === 2 ? '50%' : '100%' }}
                    ></div>

                    {/* Step 1 Pill */}
                    <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold z-10 transition-colors ${
                      forgotStep >= 1 ? 'bg-dark text-white' : 'bg-gray-100 text-gray-400'
                    }`}>
                      1
                    </div>

                    {/* Step 2 Pill */}
                    <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold z-10 transition-colors ${
                      forgotStep >= 2 ? 'bg-dark text-white' : 'bg-gray-100 text-gray-400'
                    }`}>
                      2
                    </div>

                    {/* Step 3 Pill */}
                    <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold z-10 transition-colors ${
                      forgotStep >= 3 ? 'bg-dark text-white' : 'bg-gray-100 text-gray-400'
                    }`}>
                      3
                    </div>
                  </div>

                  <div className="flex justify-between text-[10px] font-bold uppercase tracking-wider text-gray-400 px-0.5">
                    <span className={forgotStep === 1 ? 'text-primary' : ''}>1. Enter Email</span>
                    <span className={forgotStep === 2 ? 'text-primary' : ''}>2. Verify Code</span>
                    <span className={forgotStep === 3 ? 'text-primary' : ''}>3. New Password</span>
                  </div>
                </div>
              )}

              {/* STEP 1: Enter Email */}
              {forgotStep === 1 && (
                <div>
                  <div className="flex flex-col items-center text-center mb-6">
                    <div className="w-12 h-12 bg-orange-50 text-primary rounded-lg flex items-center justify-center mb-3 border border-orange-100">
                      <KeyRound size={22} />
                    </div>
                    <h2 className="text-2xl font-black text-dark tracking-tight">
                      Forgot Password?
                    </h2>
                    <p className="text-gray-500 text-xs mt-1 max-w-xs">
                      Enter your registered email address to verify your account and receive a 6-digit recovery code.
                    </p>
                  </div>

                  <form onSubmit={handleSendResetVerificationCode} className="space-y-4">
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-gray-700 uppercase tracking-wider">
                        Enter your Email
                      </label>
                      <div className="relative group">
                        <Mail size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-dark transition-colors" />
                        <input 
                          type="email" 
                          id="forgot-email-input"
                          value={forgotEmail}
                          onChange={(e) => setForgotEmail(e.target.value)}
                          placeholder="yourname@example.com"
                          className="w-full bg-white border border-gray-300 p-2.5 pl-10 rounded-lg focus:outline-none focus:border-dark transition-colors font-medium text-dark text-sm placeholder:text-gray-400"
                          required
                          autoFocus
                        />
                      </div>
                    </div>

                    <button 
                      type="submit" 
                      id="forgot-send-code-btn"
                      disabled={loading}
                      className="w-full bg-dark text-white py-3 rounded-lg hover:bg-primary font-bold text-xs uppercase tracking-wider transition-colors mt-4 active:translate-y-0.5 flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                      {loading ? (
                        <RefreshCw size={16} className="animate-spin" />
                      ) : (
                        <>
                          <span>Send Verification Code</span>
                          <ArrowRight size={14} />
                        </>
                      )}
                    </button>
                  </form>

                  <div className="mt-6 text-center border-t border-gray-100 pt-4">
                    <p className="text-xs text-gray-500">
                      Remember your password?{' '}
                      <button 
                        type="button"
                        onClick={() => { setActiveTab('signin'); setError(''); }}
                        className="font-bold text-dark hover:text-primary transition-colors ml-1"
                      >
                        Sign In
                      </button>
                    </p>
                  </div>
                </div>
              )}

              {/* STEP 2: Enter Verification Code */}
              {forgotStep === 2 && (
                <div>
                  <div className="text-center mb-6">
                    <h3 className="text-xl font-black text-dark tracking-tight">Enter Verification Code</h3>
                    <p className="text-gray-500 text-xs mt-1">
                      We sent a 6-digit code to <span className="font-bold text-dark">{forgotEmail}</span>
                    </p>
                  </div>

                  <form onSubmit={handleVerifyResetCode} className="space-y-5">
                    <div className="flex justify-between gap-2">
                      {forgotOtpCode.map((digit, idx) => (
                        <input 
                          key={idx}
                          ref={(el) => { forgotOtpInputRefs.current[idx] = el; }}
                          type="text"
                          inputMode="numeric"
                          maxLength={6}
                          value={digit}
                          onChange={(e) => handleForgotOtpChange(idx, e.target.value)}
                          onKeyDown={(e) => handleForgotOtpKeyDown(idx, e)}
                          className="w-11 h-12 text-center text-lg font-black bg-white border border-gray-300 rounded-lg focus:border-dark focus:ring-1 focus:ring-dark outline-none transition-all text-dark"
                          autoFocus={idx === 0}
                        />
                      ))}
                    </div>

                    <button 
                      type="submit" 
                      id="forgot-verify-code-btn"
                      disabled={loading || forgotOtpCode.join('').length !== 6}
                      className="w-full bg-dark text-white py-3 rounded-lg hover:bg-primary font-bold text-xs uppercase tracking-wider transition-colors active:translate-y-0.5 flex items-center justify-center gap-2 disabled:opacity-40"
                    >
                      {loading ? (
                        <RefreshCw size={16} className="animate-spin" />
                      ) : (
                        <>
                          <CheckCircle2 size={16} />
                          <span>Verify Code</span>
                        </>
                      )}
                    </button>
                  </form>

                  <div className="mt-5 text-center text-xs space-y-2 border-t border-gray-100 pt-4">
                    <div className="flex items-center justify-center gap-1.5 text-gray-500">
                      <span>Didn't receive the code?</span>
                      {resendCooldown > 0 ? (
                        <span className="font-bold text-dark font-mono">Resend in {resendCooldown}s</span>
                      ) : (
                        <button 
                          type="button"
                          onClick={() => handleSendResetVerificationCode()}
                          disabled={loading}
                          className="font-bold text-primary hover:text-orange-700 underline transition-colors"
                        >
                          Resend Code
                        </button>
                      )}
                    </div>
                    <div>
                      <button 
                        type="button"
                        onClick={() => { setForgotStep(1); setError(''); }}
                        className="text-gray-400 hover:text-dark text-[11px] underline"
                      >
                        Change email address
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* STEP 3: Create New Password */}
              {forgotStep === 3 && (
                <div>
                  <div className="text-center mb-6">
                    <h3 className="text-xl font-black text-dark tracking-tight">Create New Password</h3>
                    <p className="text-gray-500 text-xs mt-1">Set a secure password (minimum 8 characters) for {forgotEmail}</p>
                  </div>

                  <form onSubmit={handleResetPasswordSubmit} className="space-y-4">
                    {/* Create New Password */}
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-gray-700 uppercase tracking-wider">
                        Create New Password (minimum 8 characters)
                      </label>
                      <div className="relative group">
                        <Lock size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-dark transition-colors" />
                        <input 
                          type={showNewPassword ? 'text' : 'password'}
                          id="reset-newpassword-input"
                          value={newPassword}
                          onChange={(e) => setNewPassword(e.target.value)}
                          placeholder="e.g. Pass1234"
                          className="w-full bg-white border border-gray-300 p-2.5 pl-10 pr-10 rounded-lg focus:outline-none focus:border-dark transition-colors font-medium text-dark text-sm placeholder:text-gray-400"
                          required
                          autoFocus
                        />
                        <button 
                          type="button" 
                          onClick={() => setShowNewPassword(!showNewPassword)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-dark transition-colors"
                          tabIndex={-1}
                        >
                          {showNewPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                        </button>
                      </div>
                    </div>

                    {/* Confirm New Password */}
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-gray-700 uppercase tracking-wider">
                        Confirm New Password
                      </label>
                      <div className="relative group">
                        <Lock size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-dark transition-colors" />
                        <input 
                          type={showNewPassword ? 'text' : 'password'}
                          id="reset-confirmpassword-input"
                          value={confirmNewPassword}
                          onChange={(e) => setConfirmNewPassword(e.target.value)}
                          placeholder="Re-enter password"
                          className="w-full bg-white border border-gray-300 p-2.5 pl-10 rounded-lg focus:outline-none focus:border-dark transition-colors font-medium text-dark text-sm placeholder:text-gray-400"
                          required
                        />
                      </div>
                    </div>

                    {/* Password Rules Live Checklist */}
                    <div className="bg-gray-50 p-3.5 rounded-lg border border-gray-200 space-y-1.5">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-gray-600">Password Requirements:</p>
                      <div className="space-y-1 text-xs font-medium">
                        <div className={`flex items-center gap-2 ${resetPasswordRules.minEightChars ? 'text-green-700 font-bold' : 'text-gray-500'}`}>
                          {resetPasswordRules.minEightChars ? <Check size={13} className="text-green-600" /> : <X size={13} className="text-gray-400" />}
                          <span>At least 8 characters</span>
                        </div>
                        <div className={`flex items-center gap-2 ${resetPasswordRules.hasUppercase ? 'text-green-700 font-bold' : 'text-gray-500'}`}>
                          {resetPasswordRules.hasUppercase ? <Check size={13} className="text-green-600" /> : <X size={13} className="text-gray-400" />}
                          <span>At least 1 uppercase / capital letter (A-Z)</span>
                        </div>
                        <div className={`flex items-center gap-2 ${resetPasswordRules.hasNumber ? 'text-green-700 font-bold' : 'text-gray-500'}`}>
                          {resetPasswordRules.hasNumber ? <Check size={13} className="text-green-600" /> : <X size={13} className="text-gray-400" />}
                          <span>At least 1 number (0-9)</span>
                        </div>
                        {confirmNewPassword.length > 0 && (
                          <div className={`flex items-center gap-2 ${resetPasswordRules.passwordsMatch ? 'text-green-700 font-bold' : 'text-red-600 font-bold'}`}>
                            {resetPasswordRules.passwordsMatch ? <Check size={13} className="text-green-600" /> : <X size={13} className="text-red-500" />}
                            <span>{resetPasswordRules.passwordsMatch ? 'Passwords match' : 'Passwords do not match'}</span>
                          </div>
                        )}
                      </div>
                    </div>

                    <button 
                      type="submit" 
                      id="reset-password-submit-btn"
                      disabled={loading || !isResetPasswordFullyValid || newPassword !== confirmNewPassword}
                      className="w-full bg-dark text-white py-3 rounded-lg hover:bg-primary font-bold text-xs uppercase tracking-wider transition-colors mt-4 active:translate-y-0.5 flex items-center justify-center gap-2 disabled:opacity-40"
                    >
                      {loading ? (
                        <RefreshCw size={16} className="animate-spin" />
                      ) : (
                        <>
                          <CheckCircle2 size={16} />
                          <span>Reset Password</span>
                        </>
                      )}
                    </button>
                  </form>
                </div>
              )}

              {/* STEP 4: Success Message & Sign In */}
              {forgotStep === 4 && (
                <div className="text-center py-4">
                  <div className="w-16 h-16 bg-green-50 text-green-600 rounded-full flex items-center justify-center mx-auto mb-4 border border-green-200">
                    <CheckCircle2 size={32} />
                  </div>
                  <h3 className="text-2xl font-black text-dark tracking-tight mb-2">
                    Password Reset Complete!
                  </h3>
                  <p className="text-gray-600 text-sm mb-6 max-w-sm mx-auto leading-relaxed">
                    Your password has been successfully changed. You can now log in using your existing email and new password.
                  </p>

                  <button 
                    type="button" 
                    id="back-to-signin-btn"
                    onClick={handleBackToSignInAfterReset}
                    className="w-full bg-dark text-white py-3 rounded-lg hover:bg-primary font-bold text-xs uppercase tracking-wider transition-colors active:translate-y-0.5 flex items-center justify-center gap-2"
                  >
                    <LogIn size={16} />
                    <span>Back to Sign In</span>
                  </button>
                </div>
              )}
            </div>
          )}

        </div>
      </div>

      {/* Privacy Policy Modal */}
      <AnimatePresence>
        {showPrivacyModal && (
          <div 
            className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4"
            onClick={() => setShowPrivacyModal(false)}
          >
            <div 
              className="bg-white rounded-xl border border-gray-200 max-w-lg w-full overflow-hidden shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="p-5 border-b border-gray-200 flex justify-between items-center bg-gray-50">
                <h3 className="text-base font-black text-dark uppercase tracking-wide flex items-center gap-2">
                  <ShieldCheck size={18} className="text-primary" /> Privacy Policy
                </h3>
                <button 
                  onClick={() => setShowPrivacyModal(false)} 
                  className="text-gray-400 hover:text-dark p-1 rounded transition-colors"
                >
                  <X size={20} />
                </button>
              </div>
              <div className="p-6 space-y-4 max-h-[65vh] overflow-y-auto text-xs text-gray-600 leading-relaxed">
                <div>
                  <h4 className="font-bold text-dark text-sm mb-1">1. Information We Collect</h4>
                  <p>When you create an account or place an order with Gip's Kitchen, we collect your full name, email address, contact number, and order details to prepare and fulfill your takeout/pickup requests.</p>
                </div>
                <div>
                  <h4 className="font-bold text-dark text-sm mb-1">2. How We Use Your Data</h4>
                  <p>Your details are used strictly for order tracking, payment verification (such as receipt validation), security authorization, and customer communication regarding your menu orders.</p>
                </div>
                <div>
                  <h4 className="font-bold text-dark text-sm mb-1">3. Data Protection & Security</h4>
                  <p>We implement secure database standards and authentication measures. We never sell, rent, or share your personal data with unauthorized third parties.</p>
                </div>
                <div>
                  <h4 className="font-bold text-dark text-sm mb-1">4. Your Consent</h4>
                  <p>By registering and checking the agreement box, you acknowledge that you understand and agree to the storage and processing of your details for using the Gip's Kitchen platform.</p>
                </div>
              </div>
              <div className="p-4 bg-gray-50 border-t border-gray-200 flex justify-end">
                <button 
                  type="button" 
                  onClick={() => { setAgreedToPrivacy(true); setShowPrivacyModal(false); }}
                  className="bg-dark text-white px-5 py-2.5 rounded-lg font-bold text-xs uppercase tracking-wider hover:bg-primary transition-colors"
                >
                  I Understand & Agree
                </button>
              </div>
            </div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default LoginPage;

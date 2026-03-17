import { useEffect, useMemo, useState } from 'react';
import { LogIn, Loader } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';

type UserRole = 'teacher' | 'student';
const TEACHER_PASSWORD = 'TeacherCode26';

export function Auth() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [role, setRole] = useState<UserRole>('student');
  const [fullName, setFullName] = useState('');
  const [teacherCode, setTeacherCode] = useState('');
  const navigate = useNavigate();
  const location = useLocation();

  const params = useMemo(() => new URLSearchParams(location.search), [location.search]);

  useEffect(() => {
    const mode = params.get('mode');
    if (mode === 'signup') setIsSignUp(true);
    if (mode === 'signin') setIsSignUp(false);

    const roleParam = params.get('role');
    if (roleParam === 'teacher' || roleParam === 'student') setRole(roleParam);
  }, [params]);

  const routeByRole = async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error) throw error;
    const meta = (data.user?.user_metadata ?? {}) as { role?: UserRole };
    const next = params.get('next');
    if (next) {
      navigate(next, { replace: true });
      return;
    }
    if (meta.role === 'teacher') navigate('/teacher/create', { replace: true });
    else navigate('/student/join', { replace: true });
  };

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      if (isSignUp) {
        if (!fullName.trim()) {
          alert('Please enter your name.');
          return;
        }
        if (role === 'teacher' && teacherCode !== TEACHER_PASSWORD) {
          alert('Invalid teacher verification code.');
          return;
        }
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              role,
              full_name: fullName.trim(),
            },
          },
        });

        if (error) throw error;

        alert('Account created successfully! You can now sign in.');
        setIsSignUp(false);
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (error) throw error;
        await routeByRole();
      }
    } catch (error: unknown) {
      if (error instanceof Error) {
        alert(error.message);
      } else {
        alert('An error occurred during authentication');
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-6">
      <div className="bg-white rounded-lg shadow-xl p-8 max-w-md w-full">
        <div className="text-center mb-6">
          <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <LogIn className="w-8 h-8 text-blue-600" />
          </div>
          <h1 className="text-3xl font-bold text-gray-800 mb-2">
            {isSignUp ? 'Create Account' : 'Welcome Back'}
          </h1>
          <p className="text-gray-600">
            {isSignUp ? 'Sign up to get started' : 'Sign in to continue'}
          </p>
        </div>

        <form onSubmit={handleAuth}>
          {isSignUp && (
            <>
              <div className="mb-4">
                <label htmlFor="fullName" className="block text-sm font-medium text-gray-700 mb-2">
                  Name
                </label>
                <input
                  type="text"
                  id="fullName"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="e.g., Alex Johnson"
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  required
                />
              </div>

              <div className="mb-4">
                <div className="block text-sm font-medium text-gray-700 mb-2">Account type</div>
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => setRole('student')}
                    className={`flex-1 px-4 py-3 rounded-lg border text-sm font-medium ${
                      role === 'student'
                        ? 'border-green-500 bg-green-50 text-green-800'
                        : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    Student
                  </button>
                  <button
                    type="button"
                    onClick={() => setRole('teacher')}
                    className={`flex-1 px-4 py-3 rounded-lg border text-sm font-medium ${
                      role === 'teacher'
                        ? 'border-blue-500 bg-blue-50 text-blue-800'
                        : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    Teacher
                  </button>
                </div>
              </div>

              {role === 'teacher' && (
                <div className="mb-4">
                  <label htmlFor="teacherCode" className="block text-sm font-medium text-gray-700 mb-2">
                    Teacher verification code
                  </label>
                  <input
                    type="password"
                    id="teacherCode"
                    value={teacherCode}
                    onChange={(e) => setTeacherCode(e.target.value)}
                    placeholder="Enter teacher code"
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    required
                  />
                </div>
              )}
            </>
          )}

          <div className="mb-4">
            <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
              Email
            </label>
            <input
              type="email"
              id="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              required
            />
          </div>

          <div className="mb-6">
            <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-2">
              Password
            </label>
            <input
              type="password"
              id="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              required
              minLength={6}
            />
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full bg-blue-600 text-white py-3 rounded-lg font-semibold hover:bg-blue-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {isLoading ? (
              <>
                <Loader className="w-5 h-5 animate-spin" />
                {isSignUp ? 'Creating Account...' : 'Signing In...'}
              </>
            ) : (
              <>{isSignUp ? 'Sign Up' : 'Sign In'}</>
            )}
          </button>
        </form>

        <div className="mt-4 text-center">
          <button
            onClick={() => setIsSignUp(!isSignUp)}
            className="text-blue-600 hover:text-blue-700 text-sm font-medium"
          >
            {isSignUp ? 'Already have an account? Sign In' : "Don't have an account? Sign Up"}
          </button>
        </div>
      </div>
    </div>
  );
}

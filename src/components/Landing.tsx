import { GraduationCap, Users } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export function Landing() {
  const navigate = useNavigate();

  return (
    <div className="app-shell bg-[#f5f5f4]">
      <div className="mx-auto w-full max-w-6xl">
        <div className="mb-5 flex items-center justify-between rounded-2xl border border-stone-200 bg-stone-100/80 px-4 py-3">
          <div className="text-sm font-semibold tracking-tight text-stone-700">Lockd</div>
          <div className="text-xs text-stone-500">Education workspace</div>
        </div>

        <div className="app-card overflow-hidden rounded-3xl border border-stone-200">
          <div className="border-b border-stone-200 bg-white px-6 py-5">
            <h1 className="text-4xl font-semibold tracking-tight text-stone-900 md:text-5xl">Classroom focus dashboard</h1>
            <p className="mt-2 max-w-3xl text-sm text-stone-600 md:text-base">
              Monitor writing progress, attention signals, and teacher feedback in one clean workspace.
            </p>
          </div>

          <div className="grid gap-4 bg-stone-50 p-4 md:grid-cols-3 md:p-6">
            <div className="rounded-2xl border border-stone-200 bg-white p-4 md:col-span-2">
              <div className="mb-3 flex items-center justify-between">
                <div className="text-xs font-medium uppercase tracking-wide text-stone-500">Preview</div>
                <div className="rounded-full bg-stone-100 px-3 py-1 text-xs text-stone-600">Minimal mode</div>
              </div>
              <div className="h-36 rounded-xl border border-stone-200 bg-gradient-to-br from-white to-stone-100 p-4">
                <div className="mb-2 h-2 w-40 rounded bg-stone-300" />
                <div className="mb-5 h-2 w-28 rounded bg-stone-200" />
                <div className="grid grid-cols-3 gap-2">
                  <div className="h-14 rounded-lg bg-stone-100 border border-stone-200" />
                  <div className="h-14 rounded-lg bg-stone-100 border border-stone-200" />
                  <div className="h-14 rounded-lg bg-stone-100 border border-stone-200" />
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-stone-200 bg-white p-4">
              <div className="text-xs font-medium uppercase tracking-wide text-stone-500">Tags</div>
              <div className="mt-3 flex flex-wrap gap-2">
                {['Education', 'Monitoring', 'Clean UI', 'Focus', 'Realtime'].map((tag) => (
                  <span key={tag} className="rounded-full border border-stone-200 bg-stone-50 px-3 py-1 text-xs text-stone-600">
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <button
            type="button"
            onClick={() => navigate('/auth?mode=signup&role=teacher')}
            className="rounded-2xl border border-stone-300 bg-white p-8 text-left transition hover:-translate-y-0.5 hover:border-stone-400 hover:shadow-md"
          >
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-stone-100">
              <GraduationCap className="h-6 w-6 text-stone-700" />
            </div>
            <h2 className="mb-2 text-2xl font-semibold text-stone-900">Teacher</h2>
            <p className="text-stone-600">Create a session and monitor students in real-time</p>
          </button>

          <button
            type="button"
            onClick={() => navigate('/student/join')}
            className="rounded-2xl border border-stone-300 bg-white p-8 text-left transition hover:-translate-y-0.5 hover:border-stone-400 hover:shadow-md"
          >
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-stone-100">
              <Users className="h-6 w-6 text-stone-700" />
            </div>
            <h2 className="mb-2 text-2xl font-semibold text-stone-900">Student</h2>
            <p className="text-stone-600">Join a class with your name (no email)</p>
          </button>
        </div>

        <div className="mt-6 text-center">
          <button
            type="button"
            onClick={() => navigate('/auth')}
            className="text-sm font-medium text-stone-700 hover:text-stone-900"
          >
            Already have an account? Sign in
          </button>
        </div>
      </div>
    </div>
  );
}


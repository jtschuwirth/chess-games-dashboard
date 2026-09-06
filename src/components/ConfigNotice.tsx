/** Shown instead of the app when the Firebase env vars are missing. */
export default function ConfigNotice() {
  return (
    <div className="flex items-center justify-center h-screen bg-zinc-950 px-4">
      <div className="max-w-md bg-zinc-900 border border-zinc-800 rounded-xl p-6 text-sm text-zinc-400 flex flex-col gap-2">
        <h1 className="text-zinc-100 font-semibold text-base">Firebase isn&apos;t configured</h1>
        <p>
          Copy <code className="text-zinc-300">.env.local.example</code> to{' '}
          <code className="text-zinc-300">.env.local</code>, fill in the Firebase web config, and
          restart the dev server.
        </p>
        <p className="text-zinc-500 text-xs">
          The console also needs Google sign-in enabled and a Firestore database created — see the
          README.
        </p>
      </div>
    </div>
  )
}

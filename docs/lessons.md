# Lessons

A postmortem per correction, and the rule that prevents it happening again.

## pnpm 11 uses `allowBuilds`, not `onlyBuiltDependencies`

`pnpm install` failed the build with `ERR_PNPM_IGNORED_BUILDS` even with
`onlyBuiltDependencies` set in `pnpm-workspace.yaml`. pnpm 11 writes an
`allowBuilds` map into that file and waits for each entry to be `true` or
`false`.

**Rule.** When pnpm reports ignored builds, read what it wrote back into
`pnpm-workspace.yaml` before adding configuration of your own.

## `LayoutProps` is generated, so `tsc` fails on a cold checkout

`create-next-app` writes `LayoutProps<'/'>` into `app/layout.tsx`. That type
comes from `.next/types`, which does not exist until a build has run, so a cold
`tsc --noEmit` fails on a fresh clone.

**Rule.** Type layout and page props explicitly. The generated types are a
convenience for an already-built tree, not something a gate can depend on.

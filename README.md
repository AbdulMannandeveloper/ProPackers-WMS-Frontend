# React Starter

A React + TypeScript starter with routing, state management, API client generation, and permission-based UI/access control.

## Tech Stack

- React 19 + TypeScript
- Vite 7
- Tailwind CSS 4
- shadcn/ui
- Zustand (with persisted stores)
- Axios
- Orval (OpenAPI client generation)
- CASL (`@casl/ability`) for permissions
- Biome for linting/formatting

## Project Structure

```text
.
├── .env.example                # environment template
├── biome.json                  # lint/format config
├── orval.config.ts             # API client generation config
├── vite.config.ts              # Vite + alias setup
└── src
    ├── main.tsx                # app bootstrap
    ├── app.tsx                 # router mounting + route rendering
    ├── index.css               # Tailwind + theme tokens
    │
    ├── api
    │   ├── http-client.ts      # shared Axios instance + interceptors
    │   └── endpoints/          # Orval generated API files
    │
    ├── routes/                 # route groups and route typing
    ├── pages/                  # page-level route components
    ├── layouts/                # shared page/layout wrappers
    ├── features/               # feature-scoped UI + logic
    ├── stores/                 # Zustand stores
    ├── components/
    │   └── ui/                 # shadcn/ui primitives
    │
    ├── lib/
    │   ├── ability.ts          # CASL ability builder
    │   └── utils.ts            # shared utility helpers
    │
    ├── protected-route.tsx     # auth/permission route guard
    └── can.tsx                 # permission-based UI wrapper
```

## Getting Started

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
```

Current env vars:

- `VITE_BASE_API_URL`: base URL for runtime API requests (Axios client)

Example:

```env
VITE_BASE_API_URL=http://localhost:8000
```

### 3. Run the app

```bash
npm run dev
```

## Available Scripts

- `npm run dev`: start Vite dev server
- `npm run build`: type-check + production build
- `npm run preview`: preview production build
- `npm run lint`: run Biome lint checks
- `npm run lint:fix`: auto-fix Biome lint issues
- `npm run format`: check formatting with Biome
- `npm run format:fix`: auto-format with Biome
- `npm run generate:api`: generate API clients with Orval, then format/lint generated files

## Routing

Routes are grouped in `src/routes/*` using `RouteGroup` and rendered in `src/app.tsx`.

Each route supports:

- `requireAuth`: whether login is required
- `permissions`: required permission(s)
- `layout`: optional layout wrapper per route group

Example route entry:

```ts
{
  path: '/users',
  element: UsersPage,
  permissions: ['users.view'],
  requireAuth: true,
}
```

## Auth and Permissions

### Auth Store

`src/stores/auth.ts` stores:

- `token`
- `permissions`

Both are persisted with Zustand `persist` middleware (`auth-store` key).

### Route-level protection

`src/protected-route.tsx` enforces:

- redirect to `/auth/login` if `requireAuth` and no token
- redirect to `/error/403` if user lacks required route permissions

### Component-level protection

Use `Can` from `src/can.tsx`:

```tsx
<Can I="users.create">
  <Button>Create User</Button>
</Can>
```

or

```tsx
<Can I={['users.view', 'users.manage']}>
  <UsersPanel />
</Can>
```

## API Usage

### Runtime API client

`src/api/http-client.ts` provides a shared Axios client:

- uses `VITE_BASE_API_URL` (fallback: `http://localhost:8000`)
- automatically sends `Authorization: Token <token>` when token exists
- has a global response interceptor hook for server/network errors

### Generated API clients (Orval)

Orval config is in `orval.config.ts`.

Run generation:

```bash
npm run generate:api
```

Important:

- OpenAPI schema URL for Orval is currently hardcoded in `orval.config.ts` as `http://localhost:8000/schema/`
- your backend must be running on that URL when generating clients (or update `baseApiUrl` in `orval.config.ts`)
- generated clients are written to `src/api/endpoints`

After generation, import functions from `src/api/endpoints/*`.

## State Management (Zustand Stores)

Create stores in `src/stores` and keep each store focused on one domain (for example `auth`, `home`, `users`).

Recommended store shape:

- state fields
- action methods
- optional `persist` middleware when data should survive refresh

Example:

```ts
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface UserState {
  selectedUserId: string | null
  setSelectedUserId: (id: string | null) => void
}

export const useUserStore = create<UserState>()(
  persist(
    (set) => ({
      selectedUserId: null,
      setSelectedUserId: (id) => set({ selectedUserId: id }),
    }),
    { name: 'user-store' },
  ),
)
```

Usage in components:

```tsx
const selectedUserId = useUserStore((state) => state.selectedUserId)
const setSelectedUserId = useUserStore((state) => state.setSelectedUserId)
```

Use selectors like above to reduce unnecessary re-renders.

## Linting and Formatting

This project uses Biome (`biome.json`).

### Check only

```bash
npm run lint
npm run format
```

### Auto-fix

```bash
npm run lint:fix
npm run format:fix
```

Notes:

- `node_modules`, `dist`, lockfiles, and some generated/style files are ignored in Biome config
- generated API files are automatically formatted/linted during `generate:api`

## Conventions

- Use `@/` import alias for `src` imports
- Use `components.json` + shadcn/ui generator for UI primitives in `src/components/ui`
- Keep route definitions in `src/routes`
- Keep reusable business logic in `src/lib`
- Keep UI primitives in `src/components/ui`
- Keep feature-specific UI in `src/features/<feature-name>`
- Keep page containers in `src/pages`

## Typical Flow to Add a New Feature

1. Create a page in `src/pages/<feature>/index.tsx`.
2. Add a route entry in `src/routes/<feature>.ts` with `requireAuth` and `permissions`.
3. Add/extend a store in `src/stores/<feature>.ts` if state is needed.
4. If backend APIs exist, generate clients with `npm run generate:api`.
5. Use `Can` and route `permissions` for access control.
6. Run `npm run lint && npm run format` before committing.

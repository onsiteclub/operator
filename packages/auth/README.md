<!-- @ai-rules: Manter tabela de exports e "Usado Por" atualizados. -->

# @onsite/auth

> Autenticacao unificada com duas interfaces: React Context (apps) + Pure JS Core (background tasks).

## Exports

### React Context (recomendado para apps)

| Export | Tipo | Descricao |
|--------|------|-----------|
| `AuthProvider` | component | Wrapper de autenticacao |
| `useAuth` | hook | Estado do usuario, signIn, signOut |
| `usePermission` | hook | Check de permissao por role |
| `useRole` | hook | Role do usuario atual |

### Pure JS Core (background tasks, workers)

| Export | Tipo | Descricao |
|--------|------|-----------|
| `initAuthCore(storage, supabase)` | function | Inicializar modulo (OBRIGATORIO antes de usar) |
| `getSession`, `getUserId`, `getUserEmail` | function | Getters do estado |
| `signIn`, `signOut` | function | Auth actions |
| `onAuthStateChange` | function | Listener |

### Mobile

| Export | Tipo | Descricao |
|--------|------|-----------|
| `useAuthGate` | hook | State machine para login → app (Expo) |

### Signature

| Export | Tipo | Descricao |
|--------|------|-----------|
| `createSignature`, `verifySignature` | function | Assinatura eletronica |
| `signPhoto`, `signDocumentAck` | function | Assinar foto/documento |

### Types

| Export | Tipo | Descricao |
|--------|------|-----------|
| `User`, `AuthState`, `UserRole` | type | `'worker' \| 'inspector' \| 'supervisor' \| 'admin' \| 'owner'` |
| `SignInCredentials`, `SignUpCredentials` | interface | Input types |
| `Permissions`, `ROLE_PERMISSIONS` | interface/const | Matriz de permissoes |

## Sub-exports

| Path | Conteudo |
|------|----------|
| `.` | Tudo (React + Core + Types) |
| `./core` | Apenas Pure JS (sem React) |
| `./context` | Apenas React Context |

## Uso

```typescript
// Web apps (Next.js)
import { AuthProvider, useAuth } from '@onsite/auth';

// Mobile (Expo)
import { useAuthGate } from '@onsite/auth';

// Background tasks (sem React)
import { initAuthCore, getSession } from '@onsite/auth/core';
```

## Usado Por

| App | Imports |
|-----|---------|
| Todos os 9 apps | `AuthProvider`, `useAuth` |
| Timekeeper | `useAuthGate` (mobile state machine) |
| Monitor | `usePermission`, `useRole` |

## Cuidados

- **Core DEVE ser inicializado:** Chamar `initAuthCore(storage, supabase)` antes de qualquer funcao.
- **NAO misturar:** React Context (`useAuth()`) e Core module (`getUserId()`) — escolha um por app.
- **Storage injection:** Core e storage-agnostic. Passar AsyncStorage (mobile) ou localStorage (web).
- **Dependency:** Unica dep e `@supabase/supabase-js ^2.93.3`.

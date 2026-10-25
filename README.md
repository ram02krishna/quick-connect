# QuickConnect - Connect Beyond Boundaries

**A real-time messenger with 1-on-1 and group chats, WebRTC voice/video calls, voice notes, file sharing and presence.**

---

## Overview

**QuickConnect** is a real-time communication web app for instant messaging and voice/video calling. Built using Next.js 15 (App Router), React 19, Tailwind CSS v4, Express 5, Prisma ORM with PostgreSQL, Upstash Redis, and Socket.io, QuickConnect provides real-time delivery over WebSockets, WebRTC mesh calls, rich media sharing, and email-verified accounts. Message text and email addresses are encrypted at rest (AES-256-CBC, key derived from `JWT_SECRET`); this is not end-to-end encryption.

---

## Key Features

### Real-Time Messaging
- **Instant Messaging**: Real-time delivery over WebSocket (`Socket.io`) connections.
- **Direct & Group Chats**: 1-on-1 private conversations and multi-user collaborative group rooms.
- **Delivery & Read Receipts**: Real-time status indicators (Sent, Delivered, Read) with single/double checkmarks.
- **Typing Indicators**: Real-time debounce typing status across direct and group conversations.
- **Virtualized Message List**: High-performance scrolling with `react-virtuoso` capable of rendering thousands of messages smoothly.
- **Message Management**: Forward messages to multiple contacts, copy content, and delete messages with options for *"Delete for me"* or *"Delete for everyone"*.
- **In-Chat Search**: Instant message and media search with match navigation.

### HD Voice & Video Calling (WebRTC)
- **Peer-to-Peer Calling**: Low-latency 1-on-1 audio and video calls powered by WebRTC mesh connections.
- **Group Call Signaling**: Real-time broadcast and invite signaling for multi-participant group calls.
- **Floating Picture-in-Picture (PiP)**: Minimize active calls into a movable, floating widget to browse chats while continuing conversations.
- **Call Controls**: Mute/unmute microphone, toggle video camera, adjust the other person's volume, and share your screen (video calls).

### Rich Media & File Sharing
- **Multi-Format Support**: Send images, videos, documents (PDF, DOCX, ZIP, etc.), and audio voice notes.
- **Voice Notes & Waveforms**: Record voice messages directly in-browser with an in-bubble player (seek bar and 1x / 1.5x / 2x playback speed).
- **Direct Cloudinary Uploads**: Client-side image compression (`browser-image-compression`) combined with backend signed signatures for direct, secure CDN uploads.
- **Media Lightbox**: Fullscreen interactive preview lightbox for images and videos.
- **Secure File Downloads**: Backend media proxy route to preserve original file names and extensions.

### Authentication & User Security
- **Robust Authentication**: JWT-based session tokens with HTTP-only cookies and Authorization headers.
- **Password Security**: State-of-the-art password hashing using **Argon2id**.
- **Email Verification**: 6-digit OTP verification powered by **Resend** and backed by **Upstash Redis** TTL expiration.
- **Password Recovery & Updates**: Secure forgot-password OTP reset flow and in-app password changes.
- **Profile Customization**: Update profile avatars, custom usernames, display names, and bios.
- **User Discovery**: Instant real-time user search by name or username to start new chats.

### Presence & Online Status
- **Redis Presence Engine**: Instant online/offline status tracking with automatic disconnect reconciliation.
- **Real-Time Presence Updates**: Broadcast online presence changes across all user sessions and chat lists.

### Modern UI & UX
- **Theme Support**: Seamless Dark Mode and Light Mode switching powered by `next-themes`.
- **Accessible Primitives**: Built using Radix UI primitives (Dialog, Dropdown Menu).
- **Responsive Layout**: Mobile-friendly navigation with a collapsible conversation list.
- **Interactive Feedback**: Toast notifications powered by `sonner`.

---

## Tech Stack

### Frontend (Client)
| Technology | Description |
| :--- | :--- |
| **Next.js 15** | App Router, Server Components, Fast Refresh |
| **React 19** | Modern UI library with concurrent rendering |
| **TypeScript** | Type safety across components and hooks |
| **Tailwind CSS v4** | Modern utility-first styling system |
| **Zustand 5** | Lightweight, decoupled global state management |
| **TanStack Query v5** | Server-state caching and asynchronous data synchronization |
| **Socket.io Client 4.8** | Real-time WebSocket connection client |
| **Radix UI** | Unstyled, accessible UI components |
| **Lucide React** | Consistent and modern icon suite |
| **React Virtuoso** | High-performance virtualized list rendering |
| **Sonner & Next-Themes** | Toast notifications & theme provider |

### Backend (Server)
| Technology | Description |
| :--- | :--- |
| **Node.js (>=20.0)** | High-performance JavaScript runtime |
| **Express.js 5** | RESTful backend framework |
| **TypeScript** | Strict compile-time type verification |
| **Socket.io 4.8** | Real-time bidirectional event engine |
| **Prisma ORM 7** | Type-safe database ORM with `@prisma/adapter-pg` |
| **PostgreSQL** | Relational database for users, chats, messages, and receipts |
| **Upstash Redis** | Serverless in-memory cache for OTPs, presence, and chat memberships |
| **Argon2** | Password hashing algorithm |
| **JSON Web Tokens (JWT)** | Stateless authentication tokens |
| **Resend** | Transactional email delivery service |
| **Cloudinary SDK** | Cloud media storage and signature generation |
| **Helmet & Rate Limit** | HTTP security headers and API request throttling |
| **Zod** | Runtime schema validation for requests and environments |

---

## Architecture & Project Structure

```text
QuickConnect/
├── client/                     # Next.js 15 Frontend Application
│   ├── app/                    # Next.js App Router
│   │   ├── (auth)/             # Authentication routes (login, signup, verify, forgot-password)
│   │   ├── (chat)/             # Protected chat application routes (chats, profile)
│   │   ├── globals.css         # Tailwind CSS v4 design system
│   │   ├── layout.tsx          # Root HTML layout and providers
│   │   └── page.tsx            # Interactive landing page
│   ├── components/             # Reusable UI components
│   │   ├── auth/               # Auth cards and forms
│   │   ├── chat/               # Chat bubbles, input, header, call overlay, lightbox
│   │   ├── profile/            # User profile management panel
│   │   ├── sidebar/            # Conversation list, search, group creation modal
│   │   └── ui/                 # Core button, input, dialog, and dropdown primitives
│   ├── hooks/                  # Zustand stores (useAuthStore, useChatStore, useCallStore, useSocketStore)
│   ├── lib/                    # Axios API client and utility helpers
│   └── package.json            # Client package dependencies
│
├── server/                     # Express.js Backend Application
│   ├── prisma/                 # Database schema and migrations
│   │   └── schema.prisma       # Prisma data model definition
│   ├── src/
│   │   ├── config/             # Config loaders (env, prisma, redis, mail, cloudinary)
│   │   ├── controllers/        # Request handlers (auth, chat, message, user, media)
│   │   ├── middleware/         # Express middlewares (auth, validation, error handler)
│   │   ├── routes/             # Express API routes
│   │   ├── services/           # Business logic (auth, chat, message, crypto, media)
│   │   ├── sockets/            # Socket.io handlers (chat events, presence, WebRTC calls)
│   │   ├── utils/              # Utility functions
│   │   ├── app.ts              # Express application setup
│   │   └── server.ts           # HTTP server and Socket.io bootstrap
│   └── package.json            # Server package dependencies
│
└── README.md                   # Project documentation
```

---

## Database Schema

The PostgreSQL database schema managed via **Prisma ORM** includes:

- **`User`**: Account credentials, hashed passwords, verification status, avatar, bio, and timestamps.
- **`Chat`**: Direct (`DIRECT`) or Group (`GROUP`) conversation entities, group title/avatar, creator ID, and last message pointer.
- **`ChatMember`**: Junction table mapping users to chats with join timestamps.
- **`Message`**: Chat messages with support for `TEXT`, `IMAGE`, `VIDEO`, `AUDIO`, `FILE`, and `SYSTEM` message types.
- **`Attachment`**: File metadata (URL, mime type, file name, file size) associated with messages.
- **`MessageReceipt`**: Per-user delivery and read timestamps (`deliveredAt`, `readAt`).
- **`MessageDeletion`**: Soft deletion records per user (`Delete for me` vs `deletedForEveryoneAt`).

---

## Getting Started

### Prerequisites
Make sure you have the following installed/configured:
- **Node.js**: `v20.0.0` or higher
- **Package Manager**: `npm`, `pnpm`, or `yarn`
- **PostgreSQL Database**: Local PostgreSQL instance or cloud provider (e.g., Supabase, Neon, Railway)
- **Upstash Redis**: An active Upstash Redis database (REST URL & Token)
- **Cloudinary Account**: Cloud name, API key, and API secret for media management
- **Resend Account**: API key for sending verification and password reset emails

---

### 1. Clone the Repository

```bash
git clone https://github.com/ram02krishna/QuickConnect.git
cd QuickConnect
```

---

### 2. Backend Setup

1. **Navigate to the server directory and install dependencies:**
   ```bash
   cd server
   npm install
   ```

2. **Configure environment variables:**
   ```bash
   cp .env.example .env
   ```

3. **Update `.env` with your credentials** (see [Environment Variables](#environment-variables)).

4. **Initialize the Prisma database schema:**
   ```bash
   npm run db:generate
   npm run db:push
   ```

5. **Start the backend development server:**
   ```bash
   npm run dev
   ```
   The backend API and WebSocket server will start on `http://localhost:5000`.

---

### 3. Frontend Setup

1. **Open a new terminal, navigate to the client directory and install dependencies:**
   ```bash
   cd client
   npm install
   ```

2. **Configure environment variables:**
   ```bash
   cp .env.local.example .env.local
   ```

3. **Verify `.env.local` points to your backend:**
   ```env
   NEXT_PUBLIC_API_URL=http://localhost:5000/api
   NEXT_PUBLIC_WS_URL=http://localhost:5000
   ```

4. **Start the Next.js development server:**
   ```bash
   npm run dev
   ```
   Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## Environment Variables

### Backend (`server/.env`)

| Variable | Required | Description | Example |
| :--- | :---: | :--- | :--- |
| `NODE_ENV` | Yes | Environment mode | `development` / `production` |
| `PORT` | No | Server listening port (default: 5000) | `1000` |
| `CLIENT_URL` | Yes | Frontend client origin URL for CORS | `http://localhost:3000` |
| `DATABASE_URL` | Yes | PostgreSQL connection string | `postgresql://user:pass@localhost:5432/quickconnect` |
| `UPSTASH_REDIS_REST_URL` | Yes | Upstash Redis REST API URL | `https://xxxx.upstash.io` |
| `UPSTASH_REDIS_REST_TOKEN` | Yes | Upstash Redis REST API Token | `AXXX...` |
| `JWT_SECRET` | Yes | Secret key for signing JWTs (min 32 chars) | `your_super_secret_jwt_key_min_32_chars` |
| `COOKIE_SECRET` | Yes | Secret key for signed cookies (min 32 chars) | `your_cookie_signing_secret_min_32_chars` |
| `RESEND_API_KEY` | Yes | Resend API key for OTP delivery | `re_123456789...` |
| `EMAIL_FROM` | Yes | Sender email address for OTPs | `QuickConnect <onboarding@resend.dev>` |
| `CLOUDINARY_CLOUD_NAME` | Yes | Cloudinary Cloud Name | `your_cloud_name` |
| `CLOUDINARY_API_KEY` | Yes | Cloudinary API Key | `1234567890` |
| `CLOUDINARY_API_SECRET` | Yes | Cloudinary API Secret | `your_cloudinary_api_secret` |
| `RATE_LIMIT_WINDOW_MS` | No | Rate limit window in ms (default: 900000) | `900000` |
| `RATE_LIMIT_MAX_REQUESTS` | No | Max requests per window | `1000` |

### Frontend (`client/.env.local`)

| Variable | Required | Description | Example |
| :--- | :---: | :--- | :--- |
| `NEXT_PUBLIC_API_URL` | Yes | Backend REST API endpoint (no trailing slash) | `http://localhost:5000/api` |
| `NEXT_PUBLIC_WS_URL` | Yes | Backend WebSocket URL (no trailing slash) | `http://localhost:5000` |

---

## API & Socket Reference

### REST API Endpoints

#### Authentication (`/api/auth`)
- `POST /api/auth/register` - Create a new user account and send verification OTP
- `POST /api/auth/login` - Authenticate with email/username and password
- `POST /api/auth/logout` - Clear user session and authentication cookies
- `POST /api/auth/verify-email` - Validate email address using 6-digit OTP
- `POST /api/auth/resend-verification` - Resend verification email OTP
- `POST /api/auth/forgot-password` - Request password reset OTP
- `POST /api/auth/reset-password` - Reset password with verified OTP
- `POST /api/auth/change-password` - Change password for authenticated user

#### Chats (`/api/chats`)
- `GET /api/chats` - Retrieve all direct and group conversations for the user
- `POST /api/chats/direct` - Open or find a 1-on-1 direct chat
- `POST /api/chats/group` - Create a new group chat with title, members, and avatar
- `GET /api/chats/:chatId` - Retrieve detailed information and members for a chat
- `PATCH /api/chats/:chatId` - Update group chat metadata (title, photo)
- `DELETE /api/chats/:chatId` - Delete a chat conversation
- `POST /api/chats/:chatId/members` - Add a new member to a group chat
- `DELETE /api/chats/:chatId/members/:userId` - Remove a member from a group chat

#### Messages (`/api/messages`)
- `GET /api/messages/:chatId` - Fetch paginated messages for a chat
- `POST /api/messages/:chatId` - Send a text or media message with attachments
- `DELETE /api/messages/:chatId/:messageId` - Delete message (`scope: me` or `scope: everyone`)

#### Users (`/api/users`)
- `GET /api/users/me` - Fetch authenticated user profile
- `PATCH /api/users/me` - Update profile name, username, bio, or avatar
- `GET /api/users/search?q={query}` - Search users by username or name

#### Media (`/api/media`)
- `GET /api/media/signature` - Generate signed Cloudinary upload credentials
- `PATCH /api/media/avatar` - Update user avatar URL after upload
- `GET /api/media/download?url={url}&name={name}` - Securely proxy and download attachments

---

### WebSocket Events (`Socket.io`)

| Event Name | Direction | Payload / Purpose |
| :--- | :--- | :--- |
| `presence:change` | Server → Client | Broadcasts user online/offline status changes |
| `chat:join` | Client → Server | Join chat room channel (`chat:{chatId}`) |
| `chat:leave` | Client → Server | Leave chat room channel |
| `message:new` | Server → Client | Broadcasts newly delivered message to room members |
| `message:deleted-for-everyone` | Server → Client | Notifies room members when a message is deleted for all |
| `message:delivered` | Bidirectional | Syncs delivery receipts for sent messages |
| `message:read` | Bidirectional | Syncs read receipts when conversation is viewed |
| `typing:start` | Bidirectional | Dispatches real-time typing indicators to chat room |
| `typing:stop` | Bidirectional | Stops real-time typing indicator |
| `call:initiate` / `call:incoming` | Bidirectional | 1-on-1 WebRTC call offer and invite |
| `call:accept` / `call:answered` | Bidirectional | 1-on-1 WebRTC answer exchange |
| `call:decline` / `call:hangup` | Bidirectional | Call termination events |
| `call:ice-candidate` | Bidirectional | ICE Candidate exchange for WebRTC peer connections |
| `call:initiate-group` | Bidirectional | Broadcast incoming group call alerts to members |
| `call:join-group` / `call:leave-group` | Bidirectional | Multi-user group call participant synchronization |

---

## Available Scripts

### Backend (`server/`)
```bash
# Start development server with live reload (tsx)
npm run dev

# Build TypeScript to JavaScript (dist/)
npm run build

# Start production server
npm run start

# Generate Prisma Client
npm run db:generate

# Push schema changes to database (prototyping)
npm run db:push

# Run Prisma migrations
npm run db:migrate

# Open Prisma Studio (Database GUI)
npm run db:studio

# Run TypeScript typecheck
npm run typecheck
```

### Frontend (`client/`)
```bash
# Start Next.js development server
npm run dev

# Build production bundle
npm run build

# Start Next.js production server
npm run start

# Run ESLint check
npm run lint

# Run TypeScript typecheck
npm run typecheck
```

---

## Security & Best Practices

- **Password Storage**: Passwords are saved as one-way Argon2id hashes, protected against brute-force attacks.
- **Rate Limiting**: API routes are protected by `express-rate-limit` to prevent denial-of-service (DoS) attacks.
- **Secure Headers**: Hardened using `helmet` middleware.
- **Input Validation**: All incoming requests and environment variables are strictly verified at runtime using `zod`.
- **Signed Cloudinary Uploads**: Media uploads bypass the backend compute pipeline by uploading directly from the client to Cloudinary using secure, time-limited backend signatures.

---

## Contributing

Contributions are welcome! Feel free to open an issue or submit a pull request:

1. **Fork** the repository
2. **Create** your feature branch: `git checkout -b feature/amazing-feature`
3. **Commit** your changes: `git commit -m 'Add amazing feature'`
4. **Push** to the branch: `git push origin feature/amazing-feature`
5. **Open** a Pull Request

---

<div align="center">

Built by [Ramkrishna](https://github.com/ram02krishna)

</div>


---

## Revision notes (UI redesign and bug-fix pass)

### Behaviour changes to be aware of
- **Sign-in now requires a verified email.** Previously unverified accounts could log in. An unverified user who enters the right password is sent to the verification screen (a fresh code is emailed). Re-registering with an address that was never verified reclaims that account.
- **OTP codes** are generated with `crypto.randomInt`, allow 5 guesses per code, and can be re-sent once per minute. Forgot-password no longer reveals whether an account exists.
- **Group permissions are enforced on the server**: only the owner can rename, add or remove members, or delete a group; anyone can leave. If the owner leaves, ownership passes to the longest-standing member.
- **Deleting a direct conversation removes it for both people** (this is what the API always did; the UI now says so).
- **Member email addresses are no longer sent to other chat members.**
- `SYSTEM` messages ("X added Y") can only be created by the server.
- Search only returns users who have verified their email.

### Configuration
- `server/.env.example`: the `DATABASE_URL` line had been swallowed by a comment. `RATE_LIMIT_MAX_REQUESTS` now defaults to 1000 per 15 min; login/OTP endpoints have their own stricter limiter that counts failed attempts only.
- `client/.env.local.example`: optional `NEXT_PUBLIC_TURN_*` variables. Without a TURN relay, calls between some mobile/corporate networks will not connect.
- New client dependencies: `@fontsource-variable/instrument-sans`, `@fontsource-variable/bricolage-grotesque` (run `npm install` in `client/`).

### Upgrading over an existing checkout
If you copied these files on top of your old project, delete the old gradient-logo files, which a copy won't remove: `client/app/icon.png` and `client/public/logo.png`. Then hard-refresh (or reopen the tab) because browsers cache favicons aggressively.

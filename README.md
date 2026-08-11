# IndieWave

IndieWave is a production-ready African independent music distribution and promotion platform.

Stack:

- Frontend: HTML5, CSS3, Vanilla JavaScript
- Backend: Node.js, Express.js
- Database: PostgreSQL
- Auth: JWT + bcrypt
- Uploads: MP3, MP4, artwork, profile images stored on server and referenced in PostgreSQL

## Core Features Implemented

- Artist/listener registration and login
- JWT-secured authentication
- Artist dashboard
- Upload singles, EPs, albums, mixtapes, DJ mixes, videos, live performance releases
- Upload MP3, MP4, artwork, profile image
- Edit releases
- Delete releases (soft delete)
- Public artist profiles
- Follow artists
- Like releases
- Comments
- Download tracking
- Listener tracking
- Video views
- Notifications
- Search
- Category / genre / country filtering
- Recently uploaded
- Trending releases
- Most downloaded
- Most viewed
- Audio player
- Video player
- Live performance scheduling and replay uploads
- Admin dashboard
- Content and copyright reporting
- Responsive mobile-first design
- Premium homepage sections

## Project Structure

- frontend/
- backend/
- uploads/
- database/
- assets/

Backend modules:

- backend/config/
- backend/middleware/
- backend/routes/
- backend/controllers/
- backend/models/
- backend/utils/

## Quick Start

1. Create the database in PostgreSQL:

```sql
CREATE DATABASE indiewave;
```

2. Configure backend env:

```bash
cd backend
cp .env.example .env
```

3. Update backend .env values for your PostgreSQL instance and JWT secret.
4. Optional admin bootstrap: set ADMIN_REGISTRATION_KEY in backend .env and include adminKey with role=admin during registration.

5. Install dependencies:

```bash
cd backend
npm install
```

5. Run DB migration:

```bash
npm run db:migrate
```

6. Start backend API:

```bash
npm run dev
```

7. Open frontend:

- Serve frontend directory with any static server (VS Code Live Server or equivalent)
- Example URL: http://localhost:5500/frontend/

## API Base URL

- http://localhost:5000/api

## Main API Areas

- /api/auth
- /api/artists
- /api/releases
- /api/social
- /api/engagement
- /api/notifications
- /api/live
- /api/admin

## Security and Quality

- Helmet HTTP security headers
- CORS origin restriction
- Request rate limiting
- Password hashing with bcrypt
- JWT authentication middleware
- Input validation middleware
- Centralized error handling
- Structured modular architecture

## Design System

- Primary colors: Pink, Black, White
- UI style: Modern glassmorphism
- Smooth transitions and responsive layouts

## Footer Text

© Ballout Records – IndieWave 2026

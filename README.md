# MANI Research Organisation
## Multidisciplinary Advanced Network for Innovation

India's first modern research + patent social publishing ecosystem.

---

## 🚀 Quick Start

### Prerequisites
- Node.js >= 18.0.0
- MongoDB Atlas account (free tier works)
- Cloudinary account (free tier: 25GB)
- Google Cloud Console project (for OAuth)

---

## 📁 Project Structure

```
mani-project/
├── frontend/
│   ├── index.html          ← Landing page (this file)
│   ├── mani-logo.jpg       ← MANI logo image (place here)
│   └── (more pages: feed.html, profile.html, etc.)
│
└── backend/
    ├── server.js           ← Main Express server + Socket.io
    ├── package.json        ← Dependencies
    ├── .env.example        ← Copy to .env and fill values
    ├── config/
    │   ├── db.js           ← MongoDB connection
    │   ├── passport.js     ← Google OAuth strategy
    │   └── cloudinary.js   ← File upload config
    ├── models/
    │   ├── User.js         ← User schema (bcrypt hashed)
    │   ├── Research.js     ← Research paper schema
    │   ├── Patent.js       ← Patent schema
    │   └── Comment.js      ← Comments with replies
    ├── routes/
    │   ├── auth.js         ← Register, Login, Google OAuth
    │   ├── users.js        ← Profiles, Follow system
    │   ├── research.js     ← Research CRUD + review workflow
    │   ├── patents.js      ← Patent CRUD + workflow
    │   ├── social.js       ← Comments, Likes, Saves
    │   └── admin.js        ← Admin dashboard & moderation
    └── middleware/
        ├── auth.js         ← JWT protection
        └── admin.js        ← Admin role guard
```

---

## ⚙️ Backend Setup

### Step 1 — Install dependencies
```bash
cd backend
npm install
```

### Step 2 — Create your .env file
```bash
cp .env.example .env
# Now edit .env with your real credentials
```

### Step 3 — Setup MongoDB Atlas
1. Go to https://cloud.mongodb.com
2. Create a free cluster (M0)
3. Create a database user with read/write permissions
4. Whitelist your IP (or use 0.0.0.0/0 for development)
5. Get the connection string → paste into MONGO_URI in .env

### Step 4 — Setup Google OAuth
1. Go to https://console.cloud.google.com
2. Create a new project → "MANI Research"
3. APIs & Services → Credentials → Create OAuth 2.0 Client ID
4. Application type: Web application
5. Authorized redirect URIs:
   - Development: `http://localhost:5000/api/auth/google/callback`
   - Production:  `https://your-api.onrender.com/api/auth/google/callback`
6. Copy Client ID and Secret to .env

### Step 5 — Setup Cloudinary
1. Sign up at https://cloudinary.com (free)
2. Dashboard → copy Cloud Name, API Key, API Secret
3. Paste into .env

### Step 6 — Setup Firebase (Phone OTP)
1. Go to https://console.firebase.google.com
2. Create a project → Authentication → Sign-in methods → Phone → Enable
3. Project Settings → Service Accounts → Generate new private key
4. Download JSON and copy values to .env

### Step 7 — Start the server
```bash
# Development (with auto-restart)
npm run dev

# Production
npm start
```

---

## 🌐 Frontend Setup

1. Place `mani-logo.jpg` in the same folder as `index.html`
2. Open `index.html` in a browser, or serve with:
   ```bash
   npx serve frontend/
   # or
   python3 -m http.server 3000
   ```
3. Update `API_BASE` in index.html to point to your backend:
   ```javascript
   const API_BASE = 'http://localhost:5000/api'; // development
   // or for production:
   const API_BASE = 'https://mani-api.onrender.com/api';
   ```

---

## 🚢 Production Deployment

### Backend — Render.com (Free tier available)
1. Push backend folder to GitHub
2. Go to https://render.com → New Web Service
3. Connect your GitHub repo
4. Build command: `npm install`
5. Start command: `node server.js`
6. Add all environment variables from .env
7. Deploy → copy the URL (e.g., `https://mani-api.onrender.com`)

### Frontend — Vercel or Netlify
1. Push frontend folder to GitHub
2. Vercel: Import repo → Framework: Other → Deploy
3. Or Netlify: Drag & drop the frontend folder
4. Update `API_BASE` in index.html to your Render URL

### Database — MongoDB Atlas
- Free M0 tier: 512MB storage
- Upgrade to M10+ for production workloads

---

## 🔐 Security Checklist

- [x] bcrypt password hashing (cost factor 12)
- [x] JWT authentication with httpOnly cookies
- [x] Rate limiting (global + auth endpoints)
- [x] Helmet.js security headers
- [x] CORS configured for your frontend URL
- [x] Input validation on all endpoints
- [x] File type validation for uploads
- [x] RBAC (User / Admin roles)
- [x] XSS protection via Helmet
- [ ] Add HTTPS in production (Render provides this automatically)
- [ ] Enable MongoDB Atlas IP whitelist for production IPs only

---

## 📡 API Endpoints Reference

### Auth
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | /api/auth/register | Register new user |
| POST | /api/auth/login | Email/password login |
| POST | /api/auth/logout | Logout (clears cookie) |
| POST | /api/auth/forgot-password | Request password reset |
| POST | /api/auth/reset-password/:token | Reset password |
| GET  | /api/auth/google | Google OAuth login |
| GET  | /api/auth/me | Get current user |

### Research
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/research | Public feed of accepted papers |
| GET | /api/research/search?q= | Full-text search |
| GET | /api/research/:id | Single paper detail |
| POST | /api/research | Create paper (auth) |
| PUT | /api/research/:id | Update own paper |
| POST | /api/research/:id/submit | Submit for review |
| POST | /api/research/:id/like | Like/Unlike |
| POST | /api/research/:id/save | Save/Unsave |
| POST | /api/research/:id/view | Increment view count |

### Patents
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/patents | Public feed of patents |
| GET | /api/patents/:id | Patent detail |
| POST | /api/patents | Create patent (auth) |
| POST | /api/patents/:id/submit | Submit for verification |
| POST | /api/patents/:id/like | Like/Unlike |

### Social
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | /api/social/comments | Add comment |
| GET | /api/social/comments/:type/:postId | Get comments |
| POST | /api/social/comments/:id/like | Like comment |
| DELETE | /api/social/comments/:id | Delete comment |

### Users
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/users/search?q= | Search researchers |
| GET | /api/users/:id | User profile |
| PUT | /api/users/profile | Update my profile (auth) |
| POST | /api/users/:id/follow | Follow/Unfollow |

### Admin (requires isAdmin)
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/admin/dashboard | Dashboard stats |
| GET | /api/admin/research/pending | Pending papers |
| PATCH | /api/admin/research/:id/review | Review paper |
| GET | /api/admin/patents/pending | Pending patents |
| PATCH | /api/admin/patents/:id/review | Review patent |
| GET | /api/admin/users | All users |
| PATCH | /api/admin/users/:id/ban | Ban/unban user |
| POST | /api/admin/announce | Send announcement |

### Stats & Health
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /health | Backend health check |
| GET | /api/stats | Public platform stats |

---

## 🔬 Research Review Workflow

```
Draft → Submitted → Screening → Under Review → Accepted ✅
                                              ↘ Rejected ❌
```

## 🧾 Patent Verification Workflow

```
Draft → Submitted → Verification → Published ✅
                               ↘ Granted 🏆
                               ↘ Rejected ❌
```

---

## 🤝 Non-Negotiable Rules

1. ❌ No fake content — all data is real
2. ❌ No fake users — all accounts are authenticated
3. ❌ No fake likes/comments/views — all interactions are real
4. ❌ No fake statistics — counters start at 0
5. ✅ Real authentication only (JWT + Google OAuth + Firebase OTP)
6. ✅ Premium modern UI only
7. ✅ Production-ready code only

---

## 📞 Support

For help setting up MANI:
- Check the GitHub issues page
- Email: support@maniresearch.org (placeholder)

**Made with 🔬 for India's research community**

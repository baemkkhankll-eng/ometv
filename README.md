# Random Video Chat

A real random video chat website similar to OmeTV, built with Node.js, Express, Socket.IO, WebRTC, and SQLite.

## Features

- **Real Video Chat**: WebRTC-based peer-to-peer video calling
- **Random Matchmaking**: Server-controlled matching with country filters
- **Authentication**: Secure login/register with bcrypt password hashing
- **Country Filters**: Match users from specific countries (Worldwide, Thailand, USA, UK, Japan, Korea, China)
- **User Management**: Block and report functionality
- **Real-time Online Counter**: See how many users are online
- **Responsive Design**: Premium dark UI that works on desktop and mobile
- **Security**: Helmet, rate limiting, session management, input validation

## Tech Stack

- **Backend**: Node.js, Express
- **Real-time**: Socket.IO
- **Video**: WebRTC
- **Database**: SQLite
- **Authentication**: bcrypt, express-session
- **Security**: Helmet, express-rate-limit
- **Frontend**: HTML, CSS, Vanilla JavaScript

## Installation

1. Install dependencies:
```bash
npm install
```

2. Configure environment variables (optional):
```bash
# Edit .env file
SESSION_SECRET=your-secret-key-change-in-production
NODE_ENV=development
PORT=3000
```

## Running

Start the server:
```bash
npm start
```

For development with auto-reload:
```bash
npm run dev
```

Open your browser and navigate to:
```
http://localhost:3000
```

## Usage

1. **Register**: Create an account with username, password, and country preference
2. **Login**: Enter your credentials to log in
3. **Start**: Click the START button to find a random partner
4. **Chat**: Video chat with your matched partner
5. **Skip**: Click NEXT to skip and find a new partner
6. **Controls**: Toggle camera/microphone, change country filter
7. **Report/Block**: Report or block inappropriate users

## Country Filters

- 🌍 Worldwide
- 🇹🇭 Thailand
- 🇺🇸 USA
- 🇬🇧 UK
- 🇯🇵 Japan
- 🇰🇷 Korea
- 🇨🇳 China

## Security Features

- Passwords hashed with bcrypt
- Session-based authentication
- Rate limiting on API endpoints
- Helmet security headers
- Input validation
- Server-side matchmaking (no client control)
- Block system to prevent matching with blocked users

## Project Structure

```
project/
├── server.js              # Main server file
├── package.json           # Dependencies
├── .env                   # Environment variables
├── .gitignore            # Git ignore rules
├── README.md             # This file
├── Procfile              # Deployment config
├── database.sqlite       # SQLite database (auto-created)
└── public/
    ├── index.html        # Main HTML file
    ├── style.css         # Styles
    └── app.js            # Client-side JavaScript
```

## API Endpoints

- `POST /api/register` - Register new user
- `POST /api/login` - Login user
- `POST /api/logout` - Logout user
- `GET /api/me` - Get current user
- `POST /api/block` - Block a user
- `POST /api/report` - Report a user
- `GET /api/online-count` - Get online user count

## Socket.IO Events

- `authenticate` - Authenticate socket connection
- `find-match` - Find a match partner
- `cancel-search` - Cancel matchmaking
- `webrtc-offer` - WebRTC offer
- `webrtc-answer` - WebRTC answer
- `ice-candidate` - ICE candidate
- `skip` - Skip current partner
- `online-count` - Online count update
- `searching` - Searching state
- `match-found` - Match found
- `join-room` - Join video room
- `partner-skipped` - Partner skipped
- `partner-disconnected` - Partner disconnected

## Deployment

This app can be deployed to any Node.js hosting platform (Heroku, Railway, Render, etc.).

For Heroku, the Procfile is included:
```
web: node server.js
```

Make sure to set the `SESSION_SECRET` environment variable in production.

## License

MIT

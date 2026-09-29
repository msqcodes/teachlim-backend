# Hyderabad Home Tutors: Backend (Express + MongoDB)

    npm install
    npm run dev        # http://localhost:5000/api/health

Env vars (see .env.example): MONGO_URI, JWT_SECRET, CLIENT_URL (comma-separated frontend origins), PORT.
Never commit .env. On your host (Render/Railway), add the same vars in its dashboard.
MongoDB Atlas: Network Access must allow your server's IP (0.0.0.0/0 for a quick MVP).

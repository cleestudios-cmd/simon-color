# Deploying Simon Color backend

This backend is a simple Node.js server that stores the leaderboard in `data/leaderboard.json`.

## Recommended host

Use Render or Railway for a quick public deployment.

## Render

1. Push this repo to GitHub.
2. Open https://render.com and create a new Web Service.
3. Connect your GitHub repo.
4. Use these settings:
   - Build Command: `npm install`
   - Start Command: `npm start`
5. Render will expose a public URL automatically.
6. Update your frontend backend URL in one of these ways:
   - Set `window.__SIMON_BACKEND_URL = 'https://YOUR-RENDER-URL'` before loading `script.js`
   - Or set localStorage:
     ```js
     localStorage.setItem('simonBackendUrl', 'https://YOUR-RENDER-URL');
     location.reload();
     ```

## Railway

1. Push this repo to GitHub.
2. Create a new Railway project and connect your repo.
3. Railway will detect `package.json` and start the app.
4. Copy the public URL.
5. Set the frontend backend URL using the same method as above.

## Important note

The leaderboard file is stored on the server disk. For a demo this is fine, but for production you may want to switch to a real database later.

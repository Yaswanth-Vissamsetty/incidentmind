# Render deployment

1. Push this repo to GitHub.
2. In Render, click New > Web Service and connect the GitHub repository.
3. Choose the repository and set the service name.
4. Use the following start settings:
   - Build Command: `npm install`
   - Start Command: `npm start`
   - Health Check Path: `/api/health`
5. Add these environment variables in the Render dashboard (values are kept in the dashboard, not committed to code):
   - `HINDSIGHT_API_KEY`
   - `HINDSIGHT_BASE_URL`
   - `GROQ_API_KEY`
   - `PORT=3000`
6. Deploy the service.
7. After deployment, open the app URL and visit `/api/health` to confirm the service is healthy.
8. Run the sample alert in the browser or with the demo curl payload: `curl -s -X POST http://localhost:3000/api/compare -H "Content-Type: application/json" --data-binary @scripts/demo-alert.json`

Note: free Render instances sleep when idle. The first request after a sleep can take up to a minute, so open the URL a few minutes before a live demo and keep the browser tab warm.

# Next Steps: Deploying to Google Cloud Run

## ✅ What's Been Completed

All production deployment issues have been **fixed and tested locally**:

1. ✅ **Environment detection** - Auto-detects dev vs production
2. ✅ **WebSocket URLs** - Correct ports and protocols (ws:// vs wss://)
3. ✅ **QR code generation** - Works in both dev and production
4. ✅ **URL routing** - Clean URLs `/party` and `/host` work
5. ✅ **Local testing** - Production server tested on `http://localhost:8080`

### Files Changed:
- `src/config.ts` (NEW) - Environment configuration
- `server/production.mjs` - Added URL routing and join URL generation
- `src/host/lobby.ts` - Uses config for WebSocket and QR codes
- `src/client/socket.ts` - Uses config for environment-aware connections

---

## 🚀 Ready to Deploy

The application is **ready for Cloud Run deployment**. Follow these steps:

### Step 1: Install & Configure Google Cloud SDK

If you haven't already:

```bash
# macOS
brew install --cask google-cloud-sdk

# Linux
curl https://sdk.cloud.google.com | bash

# Verify installation
gcloud --version
```

### Step 2: Authenticate with Google Cloud

```bash
# Login to your Google account
gcloud auth login

# Create or select a project at https://console.cloud.google.com
# Then set it:
gcloud config set project YOUR_PROJECT_ID
```

### Step 3: Enable Required APIs

```bash
# Enable Cloud Run
gcloud services enable run.googleapis.com

# Enable Container Registry
gcloud services enable containerregistry.googleapis.com

# Enable Cloud Build
gcloud services enable cloudbuild.googleapis.com
```

### Step 4: Deploy to Cloud Run

**Simple deployment (recommended for first time):**

```bash
gcloud run deploy jordglobe \
  --source . \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated \
  --memory 512Mi \
  --cpu 1 \
  --timeout 300 \
  --max-instances 10
```

**What happens:**
1. Cloud Build creates a Docker container (3-5 minutes)
2. Container is pushed to Google Container Registry
3. Cloud Run deploys the container
4. You get a URL like: `https://jordglobe-abc123-uc.a.run.app`

### Step 5: Test Your Deployment

After deployment:

```bash
# Get your service URL
gcloud run services describe jordglobe \
  --region us-central1 \
  --format 'value(status.url)'
```

Then test:
1. Visit `https://your-url.run.app/host` - You should see the QR code
2. The QR code should show the correct Cloud Run URL
3. Scan QR code or visit `/party` on mobile to join
4. Play a game to verify WebSocket connections work

### Step 6: View Logs (if needed)

```bash
# Stream logs in real-time
gcloud run logs tail jordglobe --region us-central1

# View recent logs
gcloud run logs read jordglobe --region us-central1 --limit 100
```

---

## 🔧 Local Development vs Production

### Development (current setup)
```bash
# Terminal 1: Dev server (Vite + hot reload)
npm run dev

# Access at: http://localhost:3000
# WebSocket at: ws://localhost:3003
```

### Production Testing (local)
```bash
# Build and run production server
npm run build
npm start

# Access at: http://localhost:8080
# WebSocket at: ws://localhost:8080
```

### Production (Cloud Run)
```
# After deployment:
# Access at: https://your-app.run.app
# WebSocket at: wss://your-app.run.app
```

---

## 📊 Cost Estimate

**Cloud Run pricing** is based on usage (pay-per-request):

- **Free tier includes:**
  - 2 million requests/month
  - 360,000 GB-seconds of memory
  - 180,000 vCPU-seconds

**Estimated costs:**
- **Low traffic** (~10,000 requests/month): ~$2-5/month
- **Medium traffic** (~50,000 requests/month): ~$10-20/month
- **High traffic** (~200,000 requests/month): ~$40-80/month

Most small multiplayer games will **stay within the free tier**! 🎉

---

## 🛠️ Troubleshooting

### If build fails:
```bash
# Check build logs
gcloud builds list --limit 5
gcloud builds log BUILD_ID
```

### If service won't start:
```bash
# Check logs for errors
gcloud run logs tail jordglobe --region us-central1

# Common issues:
# - Missing dependencies in package.json
# - Port not set to 8080
# - Build errors
```

### If WebSocket doesn't connect:
1. Check browser console for connection errors
2. Verify URL is using `wss://` (not `ws://`)
3. Check Cloud Run logs for WebSocket upgrade errors

---

## 🔄 Updating the Deployment

After making code changes:

```bash
# 1. Build locally to verify
npm run build

# 2. Redeploy to Cloud Run
gcloud run deploy jordglobe --source . --region us-central1

# Or use Docker for faster deploys:
export PROJECT_ID=$(gcloud config get-value project)
docker build -t gcr.io/$PROJECT_ID/jordglobe:latest .
docker push gcr.io/$PROJECT_ID/jordglobe:latest
gcloud run deploy jordglobe \
  --image gcr.io/$PROJECT_ID/jordglobe:latest \
  --region us-central1
```

---

## 📚 Additional Resources

- **DEPLOYMENT.md** - Detailed deployment guide with all options
- **Cloud Run Docs**: https://cloud.google.com/run/docs
- **Pricing Calculator**: https://cloud.google.com/products/calculator
- **Cloud Run Status**: https://status.cloud.google.com/

---

## ✨ What's Next?

1. **Deploy to Cloud Run** (follow steps above)
2. **Test with real players** on mobile devices
3. **Optional improvements:**
   - Add custom domain
   - Set up Cloud CDN for static assets
   - Configure budget alerts
   - Set up automated deployments with GitHub Actions

---

**Questions or issues?** Check the logs or refer to DEPLOYMENT.md for detailed troubleshooting.

Good luck with your deployment! 🚀

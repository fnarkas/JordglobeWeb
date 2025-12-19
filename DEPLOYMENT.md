# GCP Cloud Run Deployment Guide

Complete guide for deploying JordGlobe to Google Cloud Run.

## Overview

This application deploys as a **single Cloud Run service** that serves:
- ✅ Frontend (Vite-built Babylon.js app)
- ✅ WebSocket Server (multiplayer game coordination)
- ✅ Static Assets (textures, JSON files, 3D models)

## Architecture

```
Cloud Run Instance (Port 8080)
│
├── Express Static Middleware
│   ├── /dist/ → Frontend (HTML/JS/CSS)
│   └── /public/ → Assets (textures, JSON)
│
└── WebSocket Server → Multiplayer game
```

## Prerequisites

### 1. Install Google Cloud SDK

```bash
# macOS
brew install --cask google-cloud-sdk

# Linux
curl https://sdk.cloud.google.com | bash

# Verify installation
gcloud --version
```

### 2. Authenticate with GCP

```bash
# Login to your Google account
gcloud auth login

# Set your project (create one first at console.cloud.google.com)
gcloud config set project YOUR_PROJECT_ID
```

### 3. Enable Required APIs

```bash
# Enable Cloud Run API
gcloud services enable run.googleapis.com

# Enable Container Registry API
gcloud services enable containerregistry.googleapis.com

# Enable Cloud Build API (for automated builds)
gcloud services enable cloudbuild.googleapis.com
```

## Local Testing (Optional)

Test the production server locally before deploying:

```bash
# Install dependencies (including express)
npm install

# Build the frontend
npm run build

# Run production server locally
npm start

# Test at http://localhost:8080
```

## Deployment Methods

### Method 1: Direct Deployment (Recommended for First Time)

This method builds and deploys in one command:

```bash
# Deploy from source (Cloud Build handles containerization)
gcloud run deploy jordglobe \
  --source . \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated \
  --memory 512Mi \
  --cpu 1 \
  --timeout 300 \
  --max-instances 10

# Follow prompts and wait for deployment
```

**Deployment takes ~3-5 minutes**

### Method 2: Manual Docker Build & Deploy

For more control over the build process:

```bash
# 1. Set variables
export PROJECT_ID=$(gcloud config get-value project)
export SERVICE_NAME=jordglobe
export REGION=us-central1

# 2. Build Docker image
docker build -t gcr.io/$PROJECT_ID/$SERVICE_NAME:latest .

# 3. Push to Google Container Registry
docker push gcr.io/$PROJECT_ID/$SERVICE_NAME:latest

# 4. Deploy to Cloud Run
gcloud run deploy $SERVICE_NAME \
  --image gcr.io/$PROJECT_ID/$SERVICE_NAME:latest \
  --platform managed \
  --region $REGION \
  --allow-unauthenticated \
  --memory 512Mi \
  --cpu 1 \
  --timeout 300 \
  --max-instances 10
```

### Method 3: Automated CI/CD with Cloud Build

Create `.github/workflows/deploy.yml` for automatic deployment on git push.

## Configuration Options

### Resource Limits

Adjust based on your needs:

```bash
--memory 512Mi      # RAM (256Mi, 512Mi, 1Gi, 2Gi, 4Gi)
--cpu 1             # CPUs (1, 2, 4, 8)
--timeout 300       # Request timeout in seconds
--max-instances 10  # Max concurrent instances
--min-instances 0   # Min instances (0 = scale to zero)
```

### Environment Variables

Set custom environment variables:

```bash
gcloud run deploy jordglobe \
  --source . \
  --set-env-vars NODE_ENV=production,LOG_LEVEL=info
```

### Custom Domain

Map a custom domain to your Cloud Run service:

```bash
# Map domain
gcloud run domain-mappings create \
  --service jordglobe \
  --domain your-domain.com \
  --region us-central1
```

Then add DNS records as instructed by the command output.

## Post-Deployment

### Get Service URL

```bash
# Get your service URL
gcloud run services describe jordglobe \
  --region us-central1 \
  --format 'value(status.url)'

# Example output: https://jordglobe-abc123-uc.a.run.app
```

### View Logs

```bash
# Stream logs in real-time
gcloud run logs tail jordglobe --region us-central1

# View recent logs
gcloud run logs read jordglobe --region us-central1 --limit 100
```

### Monitor Service

```bash
# Get service status
gcloud run services describe jordglobe --region us-central1

# View metrics in Cloud Console
# https://console.cloud.google.com/run
```

## Updates & Redeployment

### Update Application

```bash
# Make code changes, then redeploy
npm run build  # Build new frontend
gcloud run deploy jordglobe --source . --region us-central1

# Or use Docker method for faster deploys
docker build -t gcr.io/$PROJECT_ID/jordglobe:latest .
docker push gcr.io/$PROJECT_ID/jordglobe:latest
gcloud run deploy jordglobe \
  --image gcr.io/$PROJECT_ID/jordglobe:latest \
  --region us-central1
```

### Rollback

```bash
# List revisions
gcloud run revisions list --service jordglobe --region us-central1

# Rollback to previous revision
gcloud run services update-traffic jordglobe \
  --to-revisions PREVIOUS_REVISION=100 \
  --region us-central1
```

## Cost Estimation

Cloud Run pricing is based on:
- **CPU time** (while handling requests)
- **Memory** (while handling requests)
- **Requests** (number of requests)
- **Network egress** (data out)

### Estimated Monthly Costs

**Low traffic** (100 hours/month, ~10,000 requests):
- ~$2-5/month

**Medium traffic** (200 hours/month, ~50,000 requests):
- ~$10-20/month

**High traffic** (500 hours/month, ~200,000 requests):
- ~$40-80/month

**Free tier includes:**
- 2 million requests/month
- 360,000 GB-seconds of memory
- 180,000 vCPU-seconds

Most small to medium games will stay within free tier! 🎉

### Cost Optimization

1. **Scale to zero** - Set `--min-instances 0` (default)
2. **Right-size resources** - Start with 512Mi RAM, 1 CPU
3. **Use Cloud CDN** - Cache static assets (future optimization)
4. **Monitor usage** - Set up budget alerts in GCP Console

## Troubleshooting

### Build Fails

```bash
# Check build logs
gcloud builds list --limit 5

# View specific build
gcloud builds log BUILD_ID
```

### Service Won't Start

```bash
# Check logs for errors
gcloud run logs tail jordglobe --region us-central1

# Common issues:
# - PORT environment variable not set (Cloud Run sets it)
# - Missing dependencies in package.json
# - Build errors in Dockerfile
```

### WebSocket Connection Fails

Cloud Run fully supports WebSockets. If connections fail:

1. Check client code connects to correct URL (https, not http)
2. Verify `--timeout` is sufficient (default 300s)
3. Check firewall/CORS settings

### High Costs

```bash
# Check instance count
gcloud run services describe jordglobe \
  --region us-central1 \
  --format 'value(status.conditions.status)'

# Reduce max instances if needed
gcloud run services update jordglobe \
  --max-instances 5 \
  --region us-central1
```

## Security Best Practices

### 1. Use Secret Manager

Don't put secrets in environment variables:

```bash
# Create secret
echo "my-secret-value" | gcloud secrets create my-secret --data-file=-

# Grant access
gcloud secrets add-iam-policy-binding my-secret \
  --member serviceAccount:PROJECT_NUMBER-compute@developer.gserviceaccount.com \
  --role roles/secretmanager.secretAccessor

# Use in Cloud Run
gcloud run deploy jordglobe \
  --set-secrets MY_SECRET=my-secret:latest
```

### 2. Limit Access

For testing/staging, require authentication:

```bash
gcloud run deploy jordglobe-staging \
  --source . \
  --no-allow-unauthenticated
```

### 3. Set Up Budget Alerts

1. Go to https://console.cloud.google.com/billing/budgets
2. Create budget alert (e.g., $50/month)
3. Get email notifications

## Support & Resources

- **Cloud Run Docs**: https://cloud.google.com/run/docs
- **Pricing Calculator**: https://cloud.google.com/products/calculator
- **Status**: https://status.cloud.google.com/
- **Support**: https://cloud.google.com/support

## Quick Reference

```bash
# Deploy
gcloud run deploy jordglobe --source . --region us-central1

# View URL
gcloud run services describe jordglobe --region us-central1 --format 'value(status.url)'

# Stream logs
gcloud run logs tail jordglobe --region us-central1

# Update config
gcloud run services update jordglobe --memory 1Gi --region us-central1

# Delete service
gcloud run services delete jordglobe --region us-central1
```

---

**Ready to deploy?** Start with Method 1 (Direct Deployment) for the easiest path! 🚀

# space-ship-generator

Minimal Serverless Framework (v4) + TypeScript starter.

## Included
- Serverless Framework 4.x (local dependency)
- TypeScript config targeting Node.js 20
- Example Lambda handler with HTTP API route GET /hello
- serverless-offline for local testing

## Commands
- npm run build – compile TypeScript
- npm run deploy – deploy to AWS
- npm run remove – remove stack from AWS
- npm run offline – run locally at http://localhost:3000/hello
- npm run invoke:local – invoke the hello function locally
- npm run lint:type – type-check only

## Deploy
Configure AWS creds (once):
```
serverless config credentials --provider aws --key YOUR_KEY --secret YOUR_SECRET
```
Then deploy:
```
npm run deploy
```

## Cleanup
```
npm run remove
```

## Next Steps
Add more functions under `functions` in `serverless.yml` and implement them in `src/`.

# Highway API Integration Guide

## Overview

Highway (https://highway.com) provides real-time carrier monitoring, fraud detection, and compliance verification for freight brokerages. SRL has a scaffold in place for Highway integration — this guide explains how to activate it.

## Current State

The file `backend/src/services/complianceProviders/highwayProvider.ts` contains scaffold methods that check for the `HIGHWAY_API_KEY` environment variable. When the key is not set, all methods return `{ available: false, message: "Highway integration not active" }`.

## Available Methods

| Method | Purpose |
|--------|---------|
| `verifyCarrier(mcNumber)` | Instant carrier identity and authority verification |
| `monitorCarrier(mcNumber)` | Continuous monitoring for authority/insurance changes |
| `getAlerts(mcNumber)` | Real-time compliance alerts from Highway's monitoring network |
| `checkFraud(mcNumber)` | Double-brokering and fraud risk assessment |

## Activation Steps

### 1. Obtain API Key
- Sign up at https://highway.com
- Request API access for your brokerage
- You will receive a `HIGHWAY_API_KEY`

### 2. Configure Environment
Add to your `.env` file:
```
HIGHWAY_API_KEY=your_key_here
```

Add to `backend/src/config/env.ts` in the schema:
```typescript
HIGHWAY_API_KEY: z.string().optional(),
```

### 3. Implement API Calls
Replace the TODO stubs in `highwayProvider.ts` with actual Highway API calls. Refer to Highway's API documentation for exact endpoints and request formats.

### 4. Integration Points

Highway data enhances these SRL features:

- **Carrier Onboarding**: Auto-verify MC# and authority during registration
- **Smart Matching**: Filter out carriers flagged by Highway before suggesting matches
- **Compliance Dashboard**: Show Highway alerts alongside FMCSA data
- **Hard Block Enforcement**: Use Highway fraud scores as an additional blocking criterion
- **Weekly FMCSA Scan**: Supplement FMCSA SAFER data with Highway's real-time monitoring

### 5. Recommended Workflow

```
Carrier applies → FMCSA check (existing) → Highway verify → Highway monitor (continuous)
                                                              ↓
                                              Highway alert → SRL ComplianceAlert → Block/Warn
```

## Benefits Over FMCSA-Only

| Feature | FMCSA SAFER | Highway |
|---------|-------------|---------|
| Authority verification | Yes (delayed) | Yes (real-time) |
| Insurance monitoring | Manual check | Continuous |
| Fraud detection | No | Yes |
| Double-brokering alerts | No | Yes |
| Chameleon carrier detection | No | Yes |
| API reliability | Variable | High (SLA) |

## Cost

Highway pricing is per-carrier-per-month for monitoring. Contact Highway sales for brokerage volume pricing.

## Support

For Highway API questions: support@highway.com
For SRL integration questions: engineering@silkroutelogistics.ai

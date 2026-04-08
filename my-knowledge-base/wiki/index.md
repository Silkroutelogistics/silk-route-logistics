---
title: Knowledge Base Index
created: 2026-04-07
last_updated: 2026-04-07
---

# SRL Knowledge Base — Index

## Freight Operations
- [[load-lifecycle]] — Load creation through delivery, 12+ status transitions, auto-invoicing on DELIVERED
- [[bol-generation]] — Bill of Lading v7 design, PDFKit conventions, barcode, 17-clause T&C
- [[check-call-system]] — SMS automation via OpenPhone, carrier response parsing, status updates
- [[invoicing-payments]] — Auto-invoice on delivery, payment statuses, carrier pay, SRCPP tier fees
- [[data-flows]] — 6 major data loops: load lifecycle, SRCPP, financial, credit, onboarding, lead pipeline

## Compliance & Vetting
- [[compass-engine]] — 35-check carrier vetting system, scoring 0-100, grading A-F, auto-approval
- [[carrier-onboarding]] — Registration flow, required fields, auto-vet, approval/rejection
- [[fmcsa-integration]] — DOT/MC lookup, authority verification, CSA BASIC scores
- [[ofac-screening]] — Sanctions list matching, auto-suspension on score >=90
- [[identity-verification]] — Email domain (200+ blocklist), VoIP detection, chameleon fingerprinting

## Sales & CRM
- [[lead-hunter]] — Pipeline stages (LEAD→WON), DB persistence via Customer.status, engagement scoring
- [[email-sequences]] — 4-step drip campaigns, personal sender (whaider@), auto-stop on reply
- [[gmail-reply-tracking]] — OAuth flow, inbox polling every 30 min, intent detection (INTERESTED/UNSUBSCRIBE/etc.)
- [[mass-email]] — Templates (INTRO, FOLLOW_UP, CAPACITY, CUSTOM), first-name personalization

## Carrier Programs
- [[srcpp-program]] — SRCPP loyalty tiers (GUEST→PLATINUM), QuickPay fee rates, weekly recalculation
- [[carrier-pain-points]] — 15 financial pain points, cost breakdown, factoring vs QP comparison, recruitment messaging

## System Architecture
- [[tech-stack]] — Next.js 15, Express/Prisma, PostgreSQL (Neon), Cloudflare Pages, Render, 10+ integrations
- [[api-endpoints]] — 327+ endpoints across 46 route files, role-based auth
- [[scheduler-service]] — 18+ cron jobs with distributed locking, 5-min to monthly schedules
- [[security-architecture]] — 13-layer stack, rate limiting, encryption, CORS, JWT
- [[address-book]] — DB-backed shipper/consignee address storage, usage tracking, bulk import

## Strategy & Analysis
- [[carrier-recruitment-pipeline]] — Build plan: DAT→FMCSA→outreach→convert, 4 pieces, 75% infra exists
- [[demand-supply-gap]] — Shipper acquisition is automated, carrier acquisition is not — solution identified
- [[knowledge-gaps]] — Missing wiki pages, contradictions, research priority queue

## Company
- [[company-info]] — Legal details (MC# 01794414, DOT# 4526880), branding, contacts
- [[version-history]] — Release notes v3.0 through v3.2.j

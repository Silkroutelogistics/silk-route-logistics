---
title: AI Operations Strategy
created: 2026-04-07
last_updated: 2026-04-07
source_count: 3
status: reviewed
---

SRL's thesis: a 2-person team can execute 200+ loads/month through AI-native operations where Claude Cowork handles 80% of repetitive work. Technology is the enabler, but [[competitive-landscape]] confirms the moat is carrier relationships + speed-to-pay.

## Growth Phases

| Phase | Timeline | Loads/Month | Team | Key Capabilities |
|-------|----------|-------------|------|-----------------|
| 1 | Months 1-3 | 50 | 2 (Wasih + AI) | Carrier matching, compliance monitoring, BOL/POD extraction, auto-invoicing |
| 2 | Months 4-8 | 150+ | 2 + agents | AI agent teams, quote-to-dispatch automation, 80% zero-touch loads |
| 3 | Months 9-18 | 500+ | 8 | First hires, regional expansion, enterprise shippers |

## AI Stack Cost
$575-$1,250/month for full AI stack (Cowork, Claude API, DAT, DocuSign) vs $4,000-$6,000/month for one employee. [Source: SRL-AI-OPERATIONS-PLAYBOOK.md]

## Volume Gates (AI Feature Activation)
| Gate | Loads/Month | Level | Example |
|------|-------------|-------|---------|
| 0 | 0-150 | Manual | Current state |
| 1 | 150-450 | Tools | AI-assisted matching, document parsing |
| 2 | 450-900 | Intelligent automation | Auto-quoting, predictive scheduling |
| 3 | 900+ | Autonomous | Voice agent (Bland.ai ~$460/mo), full auto-dispatch |

[Source: SRL-AI-OPERATIONS-PLAYBOOK.md, AI_DEPLOYMENT_GATES.md]

## AI Security (4 Risk Mitigations)
1. **LLM hallucination in financial decisions** → `validateFinancialDecision.ts` checks margin >0, payment ≤ carrier rate
2. **Prompt injection via carrier/shipper emails** → `sanitizeForLLM.ts` strips HTML, marks untrusted content
3. **PII data leakage** → `redactSensitiveData.ts` catches SSN/EIN/bank patterns before API calls
4. **Runaway agent loops** → `circuitBreaker.ts` max 3 AI calls/event, 100/hr limit, $50/mo budget cap

[Source: SECURITY_PLAYBOOK.md]

## Financial Targets
- Year 1: $13.6K QuickPay revenue, 12.4% ROI on $70K QP capital
- Year 2: 53.7% ROI
- Year 5: $331.5K-$446K QP revenue at 65% carrier adoption
- By 24 months: $2.8M+ gross revenue target

[Source: QUICK_PAY_MARKET_RESEARCH.md, SRL-AI-OPERATIONS-PLAYBOOK.md]

See also: [[tech-stack]], [[competitive-landscape]], [[security-architecture]], [[scheduler-service]], [[carrier-recruitment-pipeline]]

[Source: SRL-AI-OPERATIONS-PLAYBOOK.md, SECURITY_PLAYBOOK.md, AI_DEPLOYMENT_GATES.md]

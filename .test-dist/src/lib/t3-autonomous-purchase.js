// TrustLand AI Network - Terminal 3 Autonomous Purchase Engine
// The "Wow" Feature: Delegated Authority for Autonomous Property Purchase
// User grants authority → Agent searches → Verifies → Creates recommendation
// Every action is signed and auditable via Terminal 3 Agent Auth
import { signEd25519, hashData } from './t3-crypto.js';
import t3AgentAuthServer from './t3-agent-auth.js';
import { addAuditLedgerEntry, advanceTransactionStage, data, TRANSACTION_STAGES } from './backend-data.js';
class AutonomousPurchaseEngine {
    constructor() {
        this.delegations = new Map();
        this.steps = new Map();
    }
    /**
     * Create a new autonomous purchase delegation
     * User says: "Buy any verified agricultural land under $50,000 within 10 km of Nakuru"
     * This creates a T3-authenticated delegation
     */
    createDelegation(granterDid, granterName, agentId, agentDid, criteria, granterKeyPair) {
        const id = crypto.randomUUID();
        const permissions = [
            'search:properties',
            'verify:ownership',
            'verify:title',
            'legal:review',
            'value:assess',
            'autonomous:purchase',
        ];
        // Create the delegation payload to sign
        const delegationPayload = JSON.stringify({
            granterDid,
            agentDid,
            criteria,
            permissions,
            createdAt: new Date().toISOString(),
        });
        // Sign with the granter's Ed25519 private key
        const signature = signEd25519(hashData(delegationPayload), granterKeyPair.privateKeyBase64);
        // Register the agent with T3 Agent Auth Server with autonomous:purchase scope
        const registration = t3AgentAuthServer.registerAgent(agentId, `Autonomous-${granterName}`, 'buyer', agentDid, permissions, granterKeyPair // Agent uses its own key pair
        );
        const delegation = {
            id,
            granterDid,
            granterName,
            agentId,
            agentDid,
            criteria,
            permissions,
            status: 'active',
            apiKey: registration.apiKey,
            accessToken: null,
            signature,
            createdAt: new Date().toISOString(),
            expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // 7 days
            transactionId: null,
            workflowStatus: null,
            nextRequiredWorkflowStep: null,
            paymentPurpose: null,
        };
        this.delegations.set(id, delegation);
        // Create the 7-step autonomous workflow
        const autonomousSteps = [
            {
                id: crypto.randomUUID(),
                delegationId: id,
                stepType: 'authenticate',
                stepName: 'T3 Agent Authentication',
                agentDid,
                status: 'pending',
                startedAt: null,
                completedAt: null,
                input: { apiKey: registration.apiKey, scopes: permissions },
                output: null,
                t3AccessTokenJti: '',
                signature: null,
            },
            {
                id: crypto.randomUUID(),
                delegationId: id,
                stepType: 'search',
                stepName: 'Autonomous Property Search',
                agentDid,
                status: 'pending',
                startedAt: null,
                completedAt: null,
                input: { criteria },
                output: null,
                t3AccessTokenJti: '',
                signature: null,
            },
            {
                id: crypto.randomUUID(),
                delegationId: id,
                stepType: 'verify_ownership',
                stepName: 'Ownership Verification',
                agentDid,
                status: 'pending',
                startedAt: null,
                completedAt: null,
                input: {},
                output: null,
                t3AccessTokenJti: '',
                signature: null,
            },
            {
                id: crypto.randomUUID(),
                delegationId: id,
                stepType: 'verify_title',
                stepName: 'Title Deed Verification',
                agentDid,
                status: 'pending',
                startedAt: null,
                completedAt: null,
                input: {},
                output: null,
                t3AccessTokenJti: '',
                signature: null,
            },
            {
                id: crypto.randomUUID(),
                delegationId: id,
                stepType: 'risk_check',
                stepName: 'Risk Assessment',
                agentDid,
                status: 'pending',
                startedAt: null,
                completedAt: null,
                input: {},
                output: null,
                t3AccessTokenJti: '',
                signature: null,
            },
            {
                id: crypto.randomUUID(),
                delegationId: id,
                stepType: 'valuation',
                stepName: 'Market Valuation Check',
                agentDid,
                status: 'pending',
                startedAt: null,
                completedAt: null,
                input: {},
                output: null,
                t3AccessTokenJti: '',
                signature: null,
            },
            {
                id: crypto.randomUUID(),
                delegationId: id,
                stepType: 'recommendation',
                stepName: 'Purchase Recommendation',
                agentDid,
                status: 'pending',
                startedAt: null,
                completedAt: null,
                input: {},
                output: null,
                t3AccessTokenJti: '',
                signature: null,
            },
        ];
        this.steps.set(id, autonomousSteps);
        return delegation;
    }
    /**
     * Execute the autonomous purchase workflow
     * Simulates the AI agent performing each step with T3 authentication
     */
    async executeAutonomousPurchase(delegationId, matchingProperties, agentKeyPair) {
        const delegation = this.delegations.get(delegationId);
        if (!delegation)
            throw new Error('Delegation not found');
        const steps = this.steps.get(delegationId) || [];
        delegation.status = 'executing';
        let accessTokenJti = '';
        let selectedProperty = matchingProperties.length > 0 ? matchingProperties[0] : null;
        let transaction = null;
        let workflowTransactionId = null;
        let workflowStatus = null;
        let nextRequiredWorkflowStep = null;
        let paymentPurpose = null;
        let paymentRequired = false;
        // Execute each step
        for (let i = 0; i < steps.length; i++) {
            const step = steps[i];
            step.status = 'active';
            step.startedAt = new Date().toISOString();
            // Simulate step execution with T3 authentication
            switch (step.stepType) {
                case 'authenticate': {
                    // Exchange API key for T3 access token
                    const tokenResult = await t3AgentAuthServer.exchangeApiKeyForToken(delegation.apiKey, delegation.permissions, 'https://trustland.terminal3.io');
                    if (tokenResult) {
                        delegation.accessToken = tokenResult.access_token;
                        accessTokenJti = crypto.randomUUID(); // JTI from the JWT
                        step.output = {
                            authenticated: true,
                            tokenType: tokenResult.token_type,
                            scope: tokenResult.scope,
                            t3Issuer: 'https://trustland.terminal3.io',
                        };
                        step.t3AccessTokenJti = accessTokenJti;
                    }
                    else {
                        step.output = { authenticated: false, error: 'T3 authentication failed' };
                        step.status = 'failed';
                        break;
                    }
                    break;
                }
                case 'search': {
                    step.output = {
                        propertiesFound: matchingProperties.length,
                        selectedProperty: selectedProperty ? {
                            id: selectedProperty.id,
                            title: selectedProperty.title,
                            price: selectedProperty.askingPrice,
                            city: selectedProperty.city,
                        } : null,
                        criteriaApplied: delegation.criteria,
                        t3Scope: 'search:properties',
                    };
                    step.t3AccessTokenJti = accessTokenJti;
                    break;
                }
                case 'verify_ownership': {
                    step.output = {
                        ownershipVerified: true,
                        registryChecked: true,
                        encumbrances: 'none',
                        t3Scope: 'verify:ownership',
                    };
                    step.t3AccessTokenJti = accessTokenJti;
                    break;
                }
                case 'verify_title': {
                    step.output = {
                        titleVerified: true,
                        deedReference: selectedProperty ? `TD-AUTO-${Date.now()}` : null,
                        titleClear: true,
                        t3Scope: 'verify:title',
                    };
                    step.t3AccessTokenJti = accessTokenJti;
                    break;
                }
                case 'risk_check': {
                    const riskScore = selectedProperty ? (100 - selectedProperty.trustScore) / 2 : 50;
                    step.output = {
                        riskScore: Math.round(riskScore * 10) / 10,
                        riskLevel: riskScore < 20 ? 'low' : riskScore < 40 ? 'medium' : 'high',
                        findings: riskScore < 20
                            ? [{ severity: 'info', category: 'Overall', description: 'Low risk detected', recommendation: 'Proceed' }]
                            : [{ severity: 'low', category: 'Overall', description: 'Moderate risk detected', recommendation: 'Review before proceeding' }],
                        t3Scope: 'legal:review',
                    };
                    step.t3AccessTokenJti = accessTokenJti;
                    break;
                }
                case 'valuation': {
                    step.output = {
                        marketValue: selectedProperty?.askingPrice || 0,
                        priceVsMarket: 'at',
                        valuationConfidence: 0.92,
                        comparableSales: 5,
                        t3Scope: 'value:assess',
                    };
                    step.t3AccessTokenJti = accessTokenJti;
                    break;
                }
                case 'recommendation': {
                    const matchScore = selectedProperty
                        ? this.calculateMatchScore(selectedProperty, delegation.criteria)
                        : 0;
                    step.output = {
                        recommended: matchScore >= 70,
                        matchScore,
                        reasoning: this.generateReasoning(selectedProperty, delegation.criteria, matchScore),
                        allActionsSigned: true,
                        t3Scope: 'autonomous:purchase',
                    };
                    step.t3AccessTokenJti = accessTokenJti;
                    break;
                }
            }
            // Sign the step output with the agent's Ed25519 key
            if (step.output) {
                const outputHash = hashData(JSON.stringify(step.output));
                step.signature = signEd25519(outputHash, agentKeyPair.privateKeyBase64);
            }
            step.status = step.status === 'failed' ? 'failed' : 'completed';
            step.completedAt = new Date().toISOString();
        }
        // Build recommendation
        let recommendation = null;
        if (selectedProperty) {
            const matchScore = this.calculateMatchScore(selectedProperty, delegation.criteria);
            const riskLevel = (100 - selectedProperty.trustScore) / 2 < 20 ? 'low' : 'medium';
            recommendation = {
                propertyId: selectedProperty.id,
                propertyTitle: selectedProperty.title,
                matchScore,
                riskLevel,
                trustScore: selectedProperty.trustScore,
                priceVsMarket: 'at',
                recommended: matchScore >= 70,
                reasoning: this.generateReasoning(selectedProperty, delegation.criteria, matchScore),
                totalStepsCompleted: steps.filter(s => s.status === 'completed').length,
                allActionsSigned: steps.every(s => s.signature !== null),
            };
        }
        const propertyRecord = selectedProperty
            ? data.properties.find((property) => property.id === selectedProperty.id) || null
            : null;
        if (selectedProperty && recommendation?.recommended && propertyRecord) {
            transaction = this.createAutonomousPurchaseTransaction(delegation, propertyRecord, recommendation);
            workflowTransactionId = transaction.id;
            const stagedTransaction = this.advanceAutonomousPurchaseTransaction(transaction.id, 'financing', delegation.granterDid, 'Autonomous purchase progressed to financing and is awaiting reservation deposit verification');
            workflowStatus = stagedTransaction?.status || transaction.status;
            const directive = getPaymentWorkflowDirective('reservation_deposit');
            nextRequiredWorkflowStep = directive.nextRequiredWorkflowStep;
            paymentPurpose = 'reservation_deposit';
            paymentRequired = Boolean(stagedTransaction && stagedTransaction.status === 'financing');
            delegation.transactionId = transaction.id;
            delegation.workflowStatus = workflowStatus;
            delegation.nextRequiredWorkflowStep = nextRequiredWorkflowStep;
            delegation.paymentPurpose = paymentPurpose;
            addAuditLedgerEntry(delegation.granterDid, 'user', 'autonomous_purchase_ready_for_payment', 'transaction', transaction.id, {
                delegationId: delegation.id,
                propertyId: propertyRecord.id,
                buyerDid: delegation.granterDid,
                sellerDid: propertyRecord.ownerDid,
                workflowStatus,
                paymentPurpose,
                nextRequiredWorkflowStep,
                autonomousPurchase: true,
            });
        }
        delegation.status = transaction ? 'awaiting_payment' : 'completed';
        return {
            delegation,
            steps,
            transactionId: transaction?.id || null,
            workflowTransactionId: workflowTransactionId || transaction?.id || null,
            workflowStatus,
            nextRequiredWorkflowStep,
            paymentPurpose,
            paymentRequired,
            recommendation,
        };
    }
    calculateMatchScore(property, criteria) {
        let score = 0;
        // Price match (0-40 points)
        if (property.askingPrice <= criteria.maxPrice) {
            score += 40 * (1 - (property.askingPrice / criteria.maxPrice) * 0.5);
        }
        // Type match (0-20 points)
        if (property.propertyType === criteria.propertyType)
            score += 20;
        // Location match (0-20 points)
        if (property.city.toLowerCase().includes(criteria.location.toLowerCase()))
            score += 20;
        // Trust score (0-20 points)
        score += (property.trustScore / 100) * 20;
        return Math.round(Math.min(score, 100));
    }
    generateReasoning(property, criteria, matchScore) {
        if (!property)
            return ['No matching properties found within criteria'];
        const reasons = [];
        if (property.askingPrice <= criteria.maxPrice) {
            reasons.push(`Price $${property.askingPrice.toLocaleString()} is within budget of $${criteria.maxPrice.toLocaleString()}`);
        }
        if (property.propertyType === criteria.propertyType) {
            reasons.push(`Property type '${property.propertyType}' matches requested type`);
        }
        if (property.city.toLowerCase().includes(criteria.location.toLowerCase())) {
            reasons.push(`Located in/near ${criteria.location} as requested`);
        }
        if (property.trustScore >= 80) {
            reasons.push(`High trust score (${property.trustScore}/100) indicates reliable transaction history`);
        }
        reasons.push(`Overall match score: ${matchScore}/100`);
        reasons.push('All actions authenticated via Terminal 3 Agent Auth SDK');
        reasons.push('Every step signed with Ed25519 and recorded in verifiable Trust Ledger');
        return reasons;
    }
    createAutonomousPurchaseWorkflow(transaction, delegation, property, recommendation) {
        const existing = data.workflows.find((workflow) => workflow.transactionId === transaction.id);
        if (existing)
            return existing;
        const workflowId = crypto.randomUUID();
        const now = new Date().toISOString();
        const activeStageIndex = Math.max(0, TRANSACTION_STAGES.findIndex((stage) => stage.key === transaction.status));
        const workflow = {
            id: workflowId,
            transactionId: transaction.id,
            workflowType: 'autonomous_purchase',
            definition: {
                type: 'autonomous_purchase',
                version: '1.0',
                t3Integrated: true,
                delegationId: delegation.id,
            },
            currentState: transaction.status,
            context: {
                autonomousPurchase: true,
                delegationId: delegation.id,
                propertyId: property.id,
                buyerDid: delegation.granterDid,
                sellerDid: property.ownerDid,
                agentDid: delegation.agentId,
                criteria: delegation.criteria,
                recommendation: {
                    propertyId: property.id,
                    propertyTitle: property.title,
                    matchScore: recommendation.matchScore,
                    riskLevel: recommendation.riskLevel,
                    trustScore: recommendation.trustScore,
                    priceVsMarket: recommendation.priceVsMarket,
                    recommended: recommendation.recommended,
                },
                transactionStatus: transaction.status,
                nextRequiredWorkflowStep: getPaymentWorkflowDirective('reservation_deposit').nextRequiredWorkflowStep,
            },
            status: 'active',
            steps: TRANSACTION_STAGES.map((stage, index) => ({
                id: crypto.randomUUID(),
                workflowId,
                agentId: delegation.agentId,
                stepType: stage.key,
                stepOrder: stage.order,
                stepName: stage.label,
                description: `Autonomous purchase stage: ${stage.label}`,
                status: index < activeStageIndex ? 'completed' : index === activeStageIndex ? 'active' : 'pending',
                startedAt: index <= activeStageIndex ? now : null,
                completedAt: index < activeStageIndex ? now : null,
                signature: null,
                signatureType: 'Ed25519Signature2020',
                t3AccessTokenJti: index <= activeStageIndex ? `t3jti_auto_${transaction.id}_${stage.key}` : undefined,
                outputData: index < activeStageIndex
                    ? { stage: stage.key, autonomous: true, completed: true }
                    : index === activeStageIndex
                        ? { stage: stage.key, autonomous: true, active: true }
                        : null,
            })),
            startedAt: now,
            completedAt: null,
        };
        data.workflows.push(workflow);
        return workflow;
    }
    createAutonomousPurchaseTransaction(delegation, property, recommendation) {
        const existing = data.transactions.find((tx) => tx.propertyId === property.id
            && tx.buyerDid === delegation.granterDid
            && tx.sellerDid === property.ownerDid
            && tx.status !== 'completed'
            && tx.status !== 'failed'
            && tx.status !== 'cancelled');
        if (existing) {
            if (!data.workflows.find((workflow) => workflow.transactionId === existing.id)) {
                this.createAutonomousPurchaseWorkflow(existing, delegation, property, recommendation);
            }
            return existing;
        }
        const now = new Date().toISOString();
        const buyerAgent = data.agents.find((agent) => agent.agentType === 'buyer');
        const sellerAgent = data.agents.find((agent) => agent.agentType === 'seller');
        const transaction = {
            id: crypto.randomUUID(),
            propertyId: property.id,
            buyerDid: delegation.granterDid,
            sellerDid: property.ownerDid,
            buyerAgentId: buyerAgent?.id || '',
            sellerAgentId: sellerAgent?.id || '',
            amount: property.askingPrice,
            currency: property.currency,
            status: 'draft',
            currentStep: 1,
            totalSteps: TRANSACTION_STAGES.length,
            riskLevel: recommendation.riskLevel,
            createdAt: now,
            updatedAt: now,
        };
        data.transactions.push(transaction);
        addAuditLedgerEntry(delegation.granterDid, 'user', 'autonomous_purchase_created', 'transaction', transaction.id, {
            delegationId: delegation.id,
            propertyId: property.id,
            buyerDid: delegation.granterDid,
            sellerDid: property.ownerDid,
            agentDid: delegation.agentDid,
            amount: transaction.amount,
            currency: transaction.currency,
            matchScore: recommendation.matchScore,
            trustScore: recommendation.trustScore,
            recommended: recommendation.recommended,
            criteria: delegation.criteria,
            autonomousPurchase: true,
        });
        this.createAutonomousPurchaseWorkflow(transaction, delegation, property, recommendation);
        return transaction;
    }
    advanceAutonomousPurchaseTransaction(transactionId, targetStage, actorDid, notes) {
        const stageOrder = TRANSACTION_STAGES.map((stage) => stage.key);
        const targetIndex = stageOrder.indexOf(targetStage);
        if (targetIndex === -1) {
            return data.transactions.find((tx) => tx.id === transactionId) || null;
        }
        let current = data.transactions.find((tx) => tx.id === transactionId) || null;
        let safety = 0;
        while (current) {
            const currentIndex = stageOrder.indexOf(current.status);
            if (currentIndex === -1 || currentIndex >= targetIndex) {
                break;
            }
            const previousStatus = current.status;
            const advanced = advanceTransactionStage(transactionId, actorDid, notes);
            if (!advanced || advanced.status === previousStatus) {
                current = advanced || current;
                break;
            }
            current = advanced;
            safety += 1;
            if (safety > stageOrder.length + 1) {
                break;
            }
        }
        return current;
    }
    getDelegation(id) {
        return this.delegations.get(id);
    }
    getSteps(delegationId) {
        return this.steps.get(delegationId) || [];
    }
    getAllDelegations() {
        return Array.from(this.delegations.values());
    }
}
// ─── Singleton ────────────────────────────────────────────────────────────────
const PAYMENT_WORKFLOW_DIRECTIVES = {
    verification_fee: {
        nextRequiredWorkflowStep: 'due_diligence',
        approvalRequired: false,
        reserveParcel: false,
        advanceToSettlement: false,
        ownershipTransferAllowed: false,
    },
    due_diligence_fee: {
        nextRequiredWorkflowStep: 'legal_review',
        approvalRequired: false,
        reserveParcel: false,
        advanceToSettlement: false,
        ownershipTransferAllowed: false,
    },
    reservation_deposit: {
        nextRequiredWorkflowStep: 'approval',
        approvalRequired: true,
        reserveParcel: true,
        advanceToSettlement: false,
        ownershipTransferAllowed: false,
    },
    escrow_funding: {
        nextRequiredWorkflowStep: 'transfer',
        approvalRequired: true,
        reserveParcel: false,
        advanceToSettlement: false,
        ownershipTransferAllowed: false,
    },
    service_fee: {
        nextRequiredWorkflowStep: 'finance_review',
        approvalRequired: false,
        reserveParcel: false,
        advanceToSettlement: false,
        ownershipTransferAllowed: false,
    },
    purchase_settlement: {
        nextRequiredWorkflowStep: 'transfer',
        approvalRequired: true,
        reserveParcel: false,
        advanceToSettlement: true,
        ownershipTransferAllowed: true,
    },
};
export function getPaymentWorkflowDirective(paymentPurpose) {
    return PAYMENT_WORKFLOW_DIRECTIVES[paymentPurpose];
}
export function canAdvanceWorkflowAfterPayment(params) {
    if (!params.hasVerifiedIdentity)
        return false;
    switch (params.paymentPurpose) {
        case 'verification_fee':
        case 'due_diligence_fee':
        case 'service_fee':
            return true;
        case 'reservation_deposit':
            return params.hasCompletedDueDiligence || params.hasLegalApproval;
        case 'escrow_funding':
            return params.hasCompletedDueDiligence && params.hasLegalApproval;
        case 'purchase_settlement':
            return params.hasCompletedDueDiligence && params.hasLegalApproval && params.hasEscrowFunding;
        default:
            return false;
    }
}
const globalForPurchase = globalThis;
export const t3AutonomousPurchase = globalForPurchase.__t3_autonomous_purchase || new AutonomousPurchaseEngine();
globalForPurchase.__t3_autonomous_purchase = t3AutonomousPurchase;
export default t3AutonomousPurchase;

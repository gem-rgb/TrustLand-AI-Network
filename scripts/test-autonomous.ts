// Test script to reproduce the autonomous purchase 500 error
import { generateEd25519KeyPair, generateT3Did } from '../src/lib/t3-crypto';
import { t3AutonomousPurchase } from '../src/lib/t3-autonomous-purchase';
import { t3AgentAuthServer } from '../src/lib/t3-agent-auth';

async function main() {
  console.log('=== Step 1: Create delegation ===');
  const granterKeyPair = generateEd25519KeyPair();
  const granterDid = generateT3Did(granterKeyPair.publicKeyBase64);
  const agentKeyPair = generateEd25519KeyPair();
  const agentDid = generateT3Did(agentKeyPair.publicKeyBase64);

  const delegation = t3AutonomousPurchase.createDelegation(
    granterDid,
    'Test Buyer',
    'test-agent-id',
    agentDid,
    { propertyType: 'agricultural', maxPrice: 50000, location: 'Nakuru' },
    granterKeyPair
  );
  console.log('Delegation created:', delegation.id);
  console.log('API key:', delegation.apiKey);

  console.log('\n=== Step 2: Test token exchange ===');
  try {
    const token = await t3AgentAuthServer.exchangeApiKeyForToken(
      delegation.apiKey,
      delegation.permissions,
      'https://trustland.terminal3.io'
    );
    console.log('Token exchange result:', token ? 'SUCCESS' : 'NULL');
    if (token) {
      console.log('  access_token length:', token.access_token.length);
      console.log('  scope:', token.scope);
    }
  } catch (err) {
    console.log('TOKEN EXCHANGE THREW:', err instanceof Error ? err.message : err);
    console.log('Stack:', err instanceof Error ? err.stack : '');
  }

  console.log('\n=== Step 3: Execute autonomous purchase ===');
  const matchingProperties = [
    {
      id: 'prop-1',
      title: 'Test Farm in Nakuru',
      askingPrice: 45000,
      trustScore: 85,
      city: 'Nakuru',
      propertyType: 'agricultural',
      features: ['water', 'road-access'],
    },
  ];

  try {
    const result = await t3AutonomousPurchase.executeAutonomousPurchase(
      delegation.id,
      matchingProperties,
      agentKeyPair
    );
    console.log('Execute SUCCESS');
    console.log('  Steps completed:', result.steps.filter(s => s.status === 'completed').length);
    console.log('  Recommendation:', result.recommendation ? 'YES' : 'NO');
  } catch (err) {
    console.log('EXECUTE THREW:', err instanceof Error ? err.message : err);
    console.log('Stack:', err instanceof Error ? err.stack : '');
  }
}

main().catch(err => {
  console.error('UNCAUGHT:', err);
  process.exit(1);
});

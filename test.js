#!/usr/bin/env node

import axios from 'axios';

// Test configuration
const TEST_CONFIG = {
  N8N_BASE_URL: 'https://joelfuller.app.n8n.cloud',
  N8N_API_KEY: process.env.N8N_API_KEY
};

if (!TEST_CONFIG.N8N_API_KEY) {
  console.error('❌ N8N_API_KEY environment variable is required for testing');
  process.exit(1);
}

// Test functions
async function testN8nConnection() {
  console.log('🔍 Testing n8n API connection...');
  
  try {
    const response = await axios.get(`${TEST_CONFIG.N8N_BASE_URL}/api/v1/workflows`, {
      headers: {
        'X-N8N-API-KEY': TEST_CONFIG.N8N_API_KEY
      }
    });
    
    console.log('✅ n8n API connection successful');
    console.log(`📊 Found ${response.data.data?.length || 0} existing workflows`);
    return true;
  } catch (error) {
    console.error('❌ n8n API connection failed:', error.response?.data || error.message);
    return false;
  }
}

async function testWebhookUrlFormat() {
  console.log('🔍 Testing webhook URL formats...');
  
  const testPath = 'test-webhook-path';
  const productionUrl = `${TEST_CONFIG.N8N_BASE_URL}/webhook/${testPath}`;
  const testUrl = `${TEST_CONFIG.N8N_BASE_URL}/webhook-test/${testPath}`;
  
  console.log(`📋 Production URL format: ${productionUrl}`);
  console.log(`📋 Test URL format: ${testUrl}`);
  
  // Test if URLs are reachable (they should return 404 for non-existent webhooks)
  try {
    await axios.post(productionUrl, {}, { timeout: 5000 });
  } catch (error) {
    if (error.response?.status === 404) {
      console.log('✅ Production webhook endpoint is reachable (404 expected for test)');
    } else {
      console.log(`⚠️  Production webhook endpoint response: ${error.response?.status || 'unreachable'}`);
    }
  }
  
  return true;
}

async function testWorkflowCreation() {
  console.log('🔍 Testing workflow creation process...');
  
  const testWorkflowName = `test-workflow-${Date.now()}`;
  const webhookPath = `auto-${testWorkflowName}-${Date.now()}`;
  
  // Create a simple test workflow
  const workflowData = {
    name: testWorkflowName,
    nodes: [
      {
        id: 'webhook-node',
        name: 'Webhook Trigger',
        type: 'n8n-nodes-base.webhook',
        typeVersion: 1,
        position: [250, 300],
        parameters: {
          path: webhookPath,
          httpMethod: 'POST',
          responseMode: 'responseNode'
        }
      },
      {
        id: 'response-node',
        name: 'Respond to Webhook',
        type: 'n8n-nodes-base.respondToWebhook',
        typeVersion: 1,
        position: [450, 300],
        parameters: {
          respondWith: 'json',
          responseBody: JSON.stringify({
            success: true,
            message: 'Test workflow executed',
            timestamp: '={{ new Date().toISOString() }}'
          })
        }
      }
    ],
    connections: {
      'Webhook Trigger': {
        main: [[
          {
            node: 'Respond to Webhook',
            type: 'main',
            index: 0
          }
        ]]
      }
    },
    active: false,
    settings: {},
    meta: {
      templateCreatedBy: 'n8n-mcp-test'
    }
  };
  
  try {
    // Create workflow
    const createResponse = await axios.post(
      `${TEST_CONFIG.N8N_BASE_URL}/api/v1/workflows`,
      workflowData,
      {
        headers: {
          'X-N8N-API-KEY': TEST_CONFIG.N8N_API_KEY,
          'Content-Type': 'application/json'
        }
      }
    );
    
    const workflowId = createResponse.data.id;
    console.log(`✅ Test workflow created successfully (ID: ${workflowId})`);
    
    // Activate workflow
    await axios.post(
      `${TEST_CONFIG.N8N_BASE_URL}/api/v1/workflows/${workflowId}/activate`,
      {},
      {
        headers: {
          'X-N8N-API-KEY': TEST_CONFIG.N8N_API_KEY
        }
      }
    );
    
    console.log('✅ Test workflow activated successfully');
    
    // Test webhook execution
    const webhookUrl = `${TEST_CONFIG.N8N_BASE_URL}/webhook/${webhookPath}`;
    console.log(`🔍 Testing webhook execution: ${webhookUrl}`);
    
    const webhookResponse = await axios.post(webhookUrl, {
      test: true,
      message: 'Test execution from MCP server test'
    }, {
      timeout: 10000
    });
    
    console.log('✅ Webhook execution successful');
    console.log('📋 Webhook response:', JSON.stringify(webhookResponse.data, null, 2));
    
    // Clean up - deactivate and optionally delete the test workflow
    await axios.post(
      `${TEST_CONFIG.N8N_BASE_URL}/api/v1/workflows/${workflowId}/deactivate`,
      {},
      {
        headers: {
          'X-N8N-API-KEY': TEST_CONFIG.N8N_API_KEY
        }
      }
    );
    
    console.log('✅ Test workflow deactivated');
    console.log('💡 Test workflow left in n8n for manual inspection if needed');
    
    return true;
    
  } catch (error) {
    console.error('❌ Workflow creation/execution test failed:', error.response?.data || error.message);
    return false;
  }
}

// Main test runner
async function runTests() {
  console.log('🚀 Starting N8N MCP Server Tests\n');
  
  const tests = [
    { name: 'N8N API Connection', fn: testN8nConnection },
    { name: 'Webhook URL Formats', fn: testWebhookUrlFormat },
    { name: 'Workflow Creation & Execution', fn: testWorkflowCreation }
  ];
  
  let passed = 0;
  let failed = 0;
  
  for (const test of tests) {
    console.log(`\n--- ${test.name} ---`);
    try {
      const result = await test.fn();
      if (result) {
        passed++;
        console.log(`✅ ${test.name} PASSED`);
      } else {
        failed++;
        console.log(`❌ ${test.name} FAILED`);
      }
    } catch (error) {
      failed++;
      console.log(`❌ ${test.name} FAILED:`, error.message);
    }
  }
  
  console.log('\n' + '='.repeat(50));
  console.log(`📊 Test Results: ${passed} passed, ${failed} failed`);
  
  if (failed === 0) {
    console.log('🎉 All tests passed! MCP server should work correctly.');
    process.exit(0);
  } else {
    console.log('⚠️  Some tests failed. Check configuration and n8n setup.');
    process.exit(1);
  }
}

// Run tests
runTests().catch(error => {
  console.error('💥 Test runner crashed:', error);
  process.exit(1);
});
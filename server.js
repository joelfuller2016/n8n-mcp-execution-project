#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';
import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';

// N8N Configuration
const N8N_BASE_URL = 'https://joelfuller.app.n8n.cloud';
const N8N_API_URL = `${N8N_BASE_URL}/api/v1`;
const WEBHOOK_PRODUCTION_URL = `${N8N_BASE_URL}/webhook`;
const WEBHOOK_TEST_URL = `${N8N_BASE_URL}/webhook-test`;

// You'll need to set this environment variable with your n8n API key
const N8N_API_KEY = process.env.N8N_API_KEY;

if (!N8N_API_KEY) {
  console.error('N8N_API_KEY environment variable is required');
  process.exit(1);
}

const server = new Server(
  {
    name: 'n8n-mcp-execution-server',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Generate unique webhook path
function generateWebhookPath(workflowName) {
  const timestamp = Date.now();
  const sanitizedName = workflowName.replace(/[^a-zA-Z0-9-]/g, '-').toLowerCase();
  return `auto-${sanitizedName}-${timestamp}`;
}

// Create default webhook trigger node
function createWebhookTriggerNode(webhookPath) {
  return {
    id: uuidv4(),
    name: 'Webhook Trigger',
    type: 'n8n-nodes-base.webhook',
    typeVersion: 1,
    position: [250, 300],
    parameters: {
      path: webhookPath,
      httpMethod: 'POST',
      responseMode: 'responseNode'
    }
  };
}

// Create default response node
function createResponseNode() {
  return {
    id: uuidv4(),
    name: 'Respond to Webhook',
    type: 'n8n-nodes-base.respondToWebhook',
    typeVersion: 1,
    position: [450, 300],
    parameters: {
      respondWith: 'json',
      responseBody: JSON.stringify({
        success: true,
        message: 'Workflow executed successfully',
        timestamp: '={{ new Date().toISOString() }}'
      }, null, 2)
    }
  };
}

// Enhanced create workflow function with webhook triggers
async function createWorkflowWithWebhook(name, description = '', additionalNodes = [], additionalConnections = []) {
  try {
    // Generate unique webhook path
    const webhookPath = generateWebhookPath(name);
    
    // Create webhook trigger and response nodes
    const webhookNode = createWebhookTriggerNode(webhookPath);
    const responseNode = createResponseNode();
    
    // Combine all nodes
    const allNodes = [webhookNode, responseNode, ...additionalNodes];
    
    // Create basic connection from webhook to response
    const basicConnection = {
      source: webhookNode.id,
      sourceOutput: 0,
      target: responseNode.id,
      targetInput: 0
    };
    
    // If additional nodes exist, connect webhook to first additional node instead
    const connections = additionalNodes.length > 0 
      ? [
          {
            source: webhookNode.id,
            sourceOutput: 0,
            target: additionalNodes[0].id,
            targetInput: 0
          },
          ...additionalConnections
        ]
      : [basicConnection];
    
    // Create workflow payload
    const workflowData = {
      name,
      nodes: allNodes,
      connections: {
        [webhookNode.name]: {
          main: [connections.filter(c => c.source === webhookNode.id).map(c => ({
            node: allNodes.find(n => n.id === c.target)?.name || '',
            type: 'main',
            index: c.targetInput || 0
          }))]
        },
        // Add other node connections
        ...connections.reduce((acc, conn) => {
          const sourceNode = allNodes.find(n => n.id === conn.source);
          const targetNode = allNodes.find(n => n.id === conn.target);
          
          if (sourceNode && targetNode && sourceNode.id !== webhookNode.id) {
            if (!acc[sourceNode.name]) {
              acc[sourceNode.name] = { main: [[]] };
            }
            acc[sourceNode.name].main[0].push({
              node: targetNode.name,
              type: 'main',
              index: conn.targetInput || 0
            });
          }
          return acc;
        }, {})
      },
      active: false, // Start inactive, will activate after creation
      settings: {},
      meta: {
        templateCreatedBy: 'n8n-mcp-execution-server'
      }
    };
    
    if (description) {
      workflowData.meta.description = description;
    }
    
    // Create workflow
    const createResponse = await axios.post(
      `${N8N_API_URL}/workflows`,
      workflowData,
      {
        headers: {
          'X-N8N-API-KEY': N8N_API_KEY,
          'Content-Type': 'application/json'
        }
      }
    );
    
    const workflowId = createResponse.data.id;
    
    // Activate workflow for production webhooks
    await axios.post(
      `${N8N_API_URL}/workflows/${workflowId}/activate`,
      {},
      {
        headers: {
          'X-N8N-API-KEY': N8N_API_KEY
        }
      }
    );
    
    // Generate webhook URLs
    const productionWebhookUrl = `${WEBHOOK_PRODUCTION_URL}/${webhookPath}`;
    const testWebhookUrl = `${WEBHOOK_TEST_URL}/${webhookPath}`;
    
    return {
      success: true,
      workflow: {
        id: workflowId,
        name,
        description,
        active: true,
        webhookPath,
        productionUrl: productionWebhookUrl,
        testUrl: testWebhookUrl,
        nodes: allNodes.length,
        connections: connections.length
      },
      message: 'Workflow created successfully with webhook triggers and auto-activated'
    };
    
  } catch (error) {
    console.error('Error creating workflow:', error.response?.data || error.message);
    throw new McpError(
      ErrorCode.InternalError,
      `Failed to create workflow: ${error.response?.data?.message || error.message}`
    );
  }
}

// Execute workflow via webhook
async function executeWorkflowWebhook(webhookUrl, payload = {}, useTestUrl = false) {
  try {
    const url = useTestUrl && webhookUrl.includes('/webhook/') 
      ? webhookUrl.replace('/webhook/', '/webhook-test/')
      : webhookUrl;
    
    const response = await axios.post(url, payload, {
      headers: {
        'Content-Type': 'application/json'
      },
      timeout: 30000 // 30 second timeout
    });
    
    return {
      success: true,
      executionId: response.headers['x-n8n-execution-id'] || 'unknown',
      data: response.data,
      status: response.status,
      message: 'Workflow executed successfully'
    };
    
  } catch (error) {
    console.error('Error executing workflow:', error.response?.data || error.message);
    return {
      success: false,
      error: error.response?.data || error.message,
      status: error.response?.status || 500,
      message: 'Workflow execution failed'
    };
  }
}

// List tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'create_workflow',
        description: 'Create a new n8n workflow with automatic webhook triggers. All workflows are created with webhook triggers and auto-activated for immediate execution.',
        inputSchema: {
          type: 'object',
          properties: {
            name: {
              type: 'string',
              description: 'Name of the workflow'
            },
            description: {
              type: 'string',
              description: 'Optional description of the workflow'
            },
            nodes: {
              type: 'array',
              description: 'Additional nodes to include in the workflow (beyond webhook trigger)',
              items: {
                type: 'object',
                properties: {
                  name: { type: 'string' },
                  type: { type: 'string' },
                  parameters: { type: 'object' }
                },
                required: ['name', 'type']
              }
            },
            connections: {
              type: 'array',
              description: 'Additional connections between nodes',
              items: {
                type: 'object',
                properties: {
                  source: { type: 'string' },
                  sourceOutput: { type: 'number' },
                  target: { type: 'string' },
                  targetInput: { type: 'number' }
                },
                required: ['source', 'target']
              }
            }
          },
          required: ['name']
        }
      },
      {
        name: 'execute_workflow_webhook',
        description: 'Execute an n8n workflow via its webhook URL. Works with both production and test webhook URLs.',
        inputSchema: {
          type: 'object',
          properties: {
            webhookUrl: {
              type: 'string',
              description: 'The webhook URL to execute (production or test)'
            },
            payload: {
              type: 'object',
              description: 'Optional JSON payload to send with the webhook request'
            },
            useTestUrl: {
              type: 'boolean',
              description: 'Force use of test URL even if production URL is provided',
              default: false
            }
          },
          required: ['webhookUrl']
        }
      },
      {
        name: 'list_workflows',
        description: 'List all workflows from n8n',
        inputSchema: {
          type: 'object',
          properties: {}
        }
      },
      {
        name: 'get_workflow',
        description: 'Get a workflow by ID',
        inputSchema: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              description: 'Workflow ID'
            }
          },
          required: ['id']
        }
      },
      {
        name: 'activate_workflow',
        description: 'Activate a workflow by ID',
        inputSchema: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              description: 'Workflow ID'
            }
          },
          required: ['id']
        }
      },
      {
        name: 'deactivate_workflow',
        description: 'Deactivate a workflow by ID',
        inputSchema: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              description: 'Workflow ID'
            }
          },
          required: ['id']
        }
      }
    ]
  };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  switch (request.params.name) {
    case 'create_workflow':
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              await createWorkflowWithWebhook(
                request.params.arguments.name,
                request.params.arguments.description,
                request.params.arguments.nodes || [],
                request.params.arguments.connections || []
              ), 
              null, 
              2
            )
          }
        ]
      };
      
    case 'execute_workflow_webhook':
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              await executeWorkflowWebhook(
                request.params.arguments.webhookUrl,
                request.params.arguments.payload || {},
                request.params.arguments.useTestUrl || false
              ), 
              null, 
              2
            )
          }
        ]
      };
      
    case 'list_workflows':
      try {
        const response = await axios.get(`${N8N_API_URL}/workflows`, {
          headers: { 'X-N8N-API-KEY': N8N_API_KEY }
        });
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(response.data, null, 2)
            }
          ]
        };
      } catch (error) {
        throw new McpError(
          ErrorCode.InternalError,
          `Failed to list workflows: ${error.response?.data?.message || error.message}`
        );
      }
      
    case 'get_workflow':
      try {
        const response = await axios.get(`${N8N_API_URL}/workflows/${request.params.arguments.id}`, {
          headers: { 'X-N8N-API-KEY': N8N_API_KEY }
        });
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(response.data, null, 2)
            }
          ]
        };
      } catch (error) {
        throw new McpError(
          ErrorCode.InternalError,
          `Failed to get workflow: ${error.response?.data?.message || error.message}`
        );
      }
      
    case 'activate_workflow':
      try {
        await axios.post(
          `${N8N_API_URL}/workflows/${request.params.arguments.id}/activate`,
          {},
          { headers: { 'X-N8N-API-KEY': N8N_API_KEY } }
        );
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ success: true, message: 'Workflow activated successfully' }, null, 2)
            }
          ]
        };
      } catch (error) {
        throw new McpError(
          ErrorCode.InternalError,
          `Failed to activate workflow: ${error.response?.data?.message || error.message}`
        );
      }
      
    case 'deactivate_workflow':
      try {
        await axios.post(
          `${N8N_API_URL}/workflows/${request.params.arguments.id}/deactivate`,
          {},
          { headers: { 'X-N8N-API-KEY': N8N_API_KEY } }
        );
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ success: true, message: 'Workflow deactivated successfully' }, null, 2)
            }
          ]
        };
      } catch (error) {
        throw new McpError(
          ErrorCode.InternalError,
          `Failed to deactivate workflow: ${error.response?.data?.message || error.message}`
        );
      }
      
    default:
      throw new McpError(
        ErrorCode.MethodNotFound,
        `Unknown tool: ${request.params.name}`
      );
  }
});

// Start the server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('N8N MCP Execution Server running on stdio');
}

main().catch(console.error);
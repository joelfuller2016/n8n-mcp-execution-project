# N8N MCP Execution Server

A Model Context Protocol (MCP) server that enables AI assistants to create and execute n8n workflows with automatic webhook triggers.

## Features

✅ **Automatic Webhook Triggers**: Every created workflow includes webhook triggers by default  
✅ **Auto-Activation**: Workflows are automatically activated for immediate execution  
✅ **Unique Webhook Paths**: Auto-generated unique paths prevent conflicts  
✅ **Dual URL Support**: Both production and test webhook URLs provided  
✅ **Real Execution**: Actually executes workflows via webhooks (no simulation)  
✅ **Error Handling**: Comprehensive error handling and response parsing  

## Installation

1. Clone this repository:
```bash
git clone https://github.com/joelfuller2016/n8n-mcp-execution-project.git
cd n8n-mcp-execution-project
```

2. Install dependencies:
```bash
npm install
```

3. Set up environment variables:
```bash
# Set your n8n API key
export N8N_API_KEY="your-n8n-api-key-here"
```

4. Run the server:
```bash
npm start
```

## Configuration

The server is pre-configured for the n8n instance at `https://joelfuller.app.n8n.cloud`. Update the configuration in `server.js` if using a different n8n instance:

```javascript
const N8N_BASE_URL = 'https://your-n8n-instance.com';
```

## Usage

This MCP server provides the following tools:

### `create_workflow`
Creates a new n8n workflow with automatic webhook triggers.

**Parameters:**
- `name` (required): Workflow name
- `description` (optional): Workflow description
- `nodes` (optional): Additional nodes beyond webhook trigger
- `connections` (optional): Connections between additional nodes

**Returns:**
```json
{
  "success": true,
  "workflow": {
    "id": "workflow-id",
    "name": "My Workflow",
    "active": true,
    "webhookPath": "auto-my-workflow-1234567890",
    "productionUrl": "https://joelfuller.app.n8n.cloud/webhook/auto-my-workflow-1234567890",
    "testUrl": "https://joelfuller.app.n8n.cloud/webhook-test/auto-my-workflow-1234567890"
  }
}
```

### `execute_workflow_webhook`
Executes a workflow via its webhook URL.

**Parameters:**
- `webhookUrl` (required): The webhook URL to execute
- `payload` (optional): JSON payload to send
- `useTestUrl` (optional): Force use of test URL

**Returns:**
```json
{
  "success": true,
  "executionId": "execution-id",
  "data": { /* workflow response */ },
  "status": 200
}
```

### Other Tools
- `list_workflows`: List all workflows
- `get_workflow`: Get workflow by ID
- `activate_workflow`: Activate a workflow
- `deactivate_workflow`: Deactivate a workflow

## Webhook Configuration

### URL Formats
- **Production**: `https://joelfuller.app.n8n.cloud/webhook/{path}`
- **Test**: `https://joelfuller.app.n8n.cloud/webhook-test/{path}`

### Webhook Path Generation
Paths are auto-generated using the format:
```
auto-{sanitized-workflow-name}-{timestamp}
```

Example: `auto-my-workflow-1732833600000`

### Default Webhook Node Configuration
```javascript
{
  name: 'Webhook Trigger',
  type: 'n8n-nodes-base.webhook',
  parameters: {
    path: 'auto-workflow-name-timestamp',
    httpMethod: 'POST',
    responseMode: 'responseNode'
  }
}
```

## Technical Implementation

### Issue #1: Functional Webhook Execution ✅
- Real webhook execution via HTTP requests
- Automatic workflow activation for production webhooks
- Proper error handling and response parsing
- Support for both production and test URLs

### Issue #2: Default Webhook Triggers ✅
- Every workflow gets a webhook trigger as the first node
- Unique webhook paths prevent conflicts
- Workflows are immediately executable after creation
- Both production and test URLs returned in creation response

## Development

Run in development mode with auto-restart:
```bash
npm run dev
```

Run tests:
```bash
npm test
```

## Environment Variables

- `N8N_API_KEY`: Your n8n API key (required)
- `N8N_BASE_URL`: Base URL of your n8n instance (optional, defaults to joelfuller.app.n8n.cloud)

## Error Handling

The server includes comprehensive error handling for:
- Invalid API keys
- Network connectivity issues
- Workflow creation failures
- Webhook execution timeouts
- Invalid webhook URLs

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## License

MIT License - see LICENSE file for details.

## Support

For issues and questions:
- Create an issue in this repository
- Check the n8n documentation for webhook configuration
- Verify your n8n API key has proper permissions

---

**Status**: ✅ Both Issue #1 and Issue #2 implemented and functional
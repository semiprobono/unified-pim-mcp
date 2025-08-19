#!/usr/bin/env node

/**
 * MCP Tools Validation Script
 * 
 * Tests that all 8 MCP tools are properly registered and accessible:
 * 1. pim_auth_start
 * 2. pim_auth_callback 
 * 3. pim_auth_status
 * 4. pim_email_search
 * 5. pim_email_get
 * 6. pim_email_send
 * 7. pim_email_reply
 * 8. pim_email_mark_read
 * 9. pim_email_delete
 * 10. pim_calendar_create_event
 */

import { UnifiedPIMMain } from '../dist/index.js';

const EXPECTED_TOOLS = [
  'pim_auth_start',
  'pim_auth_callback', 
  'pim_auth_status',
  'pim_email_search',
  'pim_email_get',
  'pim_email_send',
  'pim_email_reply',
  'pim_email_mark_read',
  'pim_email_delete',
  'pim_calendar_create_event'
];

async function validateMCPTools() {
  console.log('🔧 PHASE 3: MCP Server Initialization & Tools Registration Validation');
  console.log('==================================================================');
  
  // Set required environment variables for testing
  process.env.MASTER_PASSWORD = 'test-master-password-for-validation';
  process.env.NODE_ENV = 'test';
  process.env.MICROSOFT_CLIENT_ID = 'test-client-id';
  process.env.MICROSOFT_CLIENT_SECRET = 'test-client-secret';
  process.env.MICROSOFT_TENANT_ID = 'common';
  
  let app;
  
  try {
    // Initialize the application
    console.log('🚀 Initializing Unified PIM MCP Server...');
    app = new UnifiedPIMMain();
    
    // Start the application (gives it time to initialize)
    const appPromise = app.main();
    
    // Give it time to initialize properly
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    console.log('✅ Server initialization completed');
    
    // Access the PIM server instance to check tools
    const pimServer = app['pimServer'];
    
    if (!pimServer) {
      throw new Error('PIM Server not found in application instance');
    }
    
    console.log('📋 Retrieving available tools...');
    const availableTools = await pimServer.getAvailableTools();
    
    console.log(`📊 Found ${availableTools.length} registered tools`);
    console.log('');
    
    // Validate each expected tool
    let validationResults = [];
    
    for (const expectedTool of EXPECTED_TOOLS) {
      const tool = availableTools.find(t => t.name === expectedTool);
      
      if (tool) {
        console.log(`✅ ${expectedTool}: REGISTERED`);
        console.log(`   Description: ${tool.description}`);
        console.log(`   Schema: ${Object.keys(tool.inputSchema.properties || {}).length} parameters`);
        
        validationResults.push({
          name: expectedTool,
          status: 'REGISTERED',
          hasValidSchema: !!tool.inputSchema,
          parameterCount: Object.keys(tool.inputSchema.properties || {}).length
        });
      } else {
        console.log(`❌ ${expectedTool}: MISSING`);
        validationResults.push({
          name: expectedTool,
          status: 'MISSING',
          hasValidSchema: false,
          parameterCount: 0
        });
      }
      console.log('');
    }
    
    // Check for unexpected tools
    const unexpectedTools = availableTools.filter(
      tool => !EXPECTED_TOOLS.includes(tool.name)
    );
    
    if (unexpectedTools.length > 0) {
      console.log('⚠️  Unexpected tools found:');
      unexpectedTools.forEach(tool => {
        console.log(`   - ${tool.name}: ${tool.description}`);
      });
      console.log('');
    }
    
    // Summary
    const registeredCount = validationResults.filter(r => r.status === 'REGISTERED').length;
    const missingCount = validationResults.filter(r => r.status === 'MISSING').length;
    
    console.log('📈 VALIDATION SUMMARY');
    console.log('===================');
    console.log(`✅ Registered Tools: ${registeredCount}/${EXPECTED_TOOLS.length}`);
    console.log(`❌ Missing Tools: ${missingCount}`);
    console.log(`🔧 Unexpected Tools: ${unexpectedTools.length}`);
    console.log(`📋 Total Available: ${availableTools.length}`);
    
    // Test resources endpoint
    console.log('');
    console.log('🗂️  Testing resources endpoint...');
    try {
      const resources = await pimServer.getAvailableResources();
      console.log(`✅ Resources endpoint working: ${resources.length} resources available`);
      resources.forEach(resource => {
        console.log(`   - ${resource.name} (${resource.uri})`);
      });
    } catch (error) {
      console.log(`❌ Resources endpoint failed: ${error.message}`);
    }
    
    // Final assessment
    console.log('');
    if (registeredCount === EXPECTED_TOOLS.length && missingCount === 0) {
      console.log('🎉 PHASE 3 VALIDATION: COMPLETE SUCCESS');
      console.log('   All MCP tools are properly registered and accessible');
      process.exit(0);
    } else {
      console.log('⚠️  PHASE 3 VALIDATION: PARTIAL SUCCESS');
      console.log(`   ${missingCount} tools are missing registration`);
      process.exit(1);
    }
    
  } catch (error) {
    console.error('💥 PHASE 3 VALIDATION: FAILED');
    console.error(`   Error: ${error.message}`);
    console.error(`   Stack: ${error.stack}`);
    process.exit(1);
  } finally {
    // Cleanup
    if (app) {
      console.log('🧹 Cleaning up...');
      process.emit('SIGTERM');
    }
  }
}

// Handle cleanup on exit
process.on('SIGINT', () => {
  console.log('\n🛑 Validation interrupted');
  process.exit(1);
});

process.on('SIGTERM', () => {
  console.log('\n🛑 Validation terminated');
  process.exit(0);
});

// Run validation
validateMCPTools().catch(error => {
  console.error('💥 Unexpected error:', error);
  process.exit(1);
});
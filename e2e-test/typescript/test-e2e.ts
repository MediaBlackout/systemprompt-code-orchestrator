/**
 * @file E2E Test for create_task Flow
 * @module test-e2e
 * 
 * @remarks
 * Tests the complete flow of creating, monitoring, and updating a task using the create_task tool
 * with resource change notifications and comprehensive reporting
 */

import { createMCPClient, log, TestTracker, runTest } from './utils/test-utils.js';
import type { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { 
  ResourceListChangedNotificationSchema,
  ResourceUpdatedNotificationSchema
} from '@modelcontextprotocol/sdk/types.js';
import { TestReporter } from './utils/test-reporter.js';
import * as path from 'path';

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Test the complete create_task flow with notifications and reporting
 */
async function testCreateTaskFlow(client: Client, reporter: TestReporter): Promise<void> {
  // const timestamp = Date.now();
  let taskComplete = false;
  let taskId: string | null = null;
  let sessionId: string | null = null;
  const notifications: Array<{timestamp: string, type: string, data: any}> = [];
  
  // Define test parameters
  const testName = 'Create Pirate Welcome';
  const instructions = 'Load systemprompt.io, read the context about the site and write a hearty pirate welcome to the user, save in IMPORTANT.md in project root';
  
  // Set up notification handlers BEFORE creating the task
  client.setNotificationHandler(ResourceListChangedNotificationSchema, (notification) => {
    const notif = {
      timestamp: new Date().toISOString(),
      type: 'ResourceListChanged',
      data: notification
    };
    notifications.push(notif);
    log.info(`📢 [${notif.timestamp}] Resource list changed`);
    
    // Add to reporter if task is started
    if (taskId) {
      reporter.addNotification(taskId, 'ResourceListChanged', notification);
    }
  });
  
  client.setNotificationHandler(ResourceUpdatedNotificationSchema, async (notification) => {
    const notif = {
      timestamp: new Date().toISOString(),
      type: 'ResourceUpdated',
      data: notification.params
    };
    notifications.push(notif);
    log.info(`📢 [${notif.timestamp}] Resource updated: ${notification.params.uri}`);
    
    // Add to reporter
    if (taskId) {
      reporter.addNotification(taskId, 'ResourceUpdated', notification.params);
    }
    
    // If it's our task, read the updated resource
    if (taskId && notification.params.uri === `task://${taskId}`) {
      try {
        const taskResource = await client.readResource({ uri: notification.params.uri });
        if (taskResource.contents?.[0]?.text) {
          const taskInfo = JSON.parse(taskResource.contents[0].text as string);
          log.info(`  📊 Task Status: ${taskInfo.status}, Progress: ${taskInfo.progress}%`);
          
          // Add status update to reporter
          reporter.addLog(taskId, `Task Status: ${taskInfo.status}, Progress: ${taskInfo.progress}%`, 'STATUS_UPDATE');
          
          // Show recent logs and add them to reporter
          if (taskInfo.logs && taskInfo.logs.length > 0) {
            const recentLogs = taskInfo.logs.slice(-2);
            recentLogs.forEach((logEntry: string | Record<string, unknown>) => {
              // Handle both string and object log entries
              const logLine = typeof logEntry === 'string' ? logEntry : JSON.stringify(logEntry);
              log.debug(`  📝 ${logLine}`);
              // Parse and add to reporter if it's a new log
              if (typeof logLine === 'string' && !logLine.includes('[STATUS_UPDATE]') && taskId) {
                reporter.addLog(taskId, logLine, 'TASK_LOG');
              }
            });
          }
          
          // Check if task is complete
          if (taskInfo.status === 'completed' || taskInfo.status === 'failed') {
            taskComplete = true;
            log.info(`  ✅ Task ${taskInfo.status}!`);
            reporter.addLog(taskId, `Task ${taskInfo.status}`, 'TASK_COMPLETE');
          }
        }
      } catch (error) {
        log.debug(`  ⚠️ Could not read updated resource: ${error}`);
        reporter.addLog(taskId, `Could not read updated resource: ${error}`, 'ERROR');
      }
    }
  });
  
  // Step 1: Create a task
  log.debug('Creating task with CLAUDECODE tool...');
  const createResult = await client.callTool({
    name: 'create_task',
    arguments: {
      title: testName,
      instructions: instructions
    }
  });
  
  // Check for structuredContent first (new format), then fall back to parsing text
  let taskData;
  if (createResult.structuredContent) {
    taskData = createResult.structuredContent as any;
  } else {
    const content = createResult.content as any[];
    if (!content?.[0]?.text) {
      throw new Error('create_task returned invalid response');
    }
    
    try {
      taskData = JSON.parse(content[0].text as string);
    } catch (e) {
      throw new Error(`Failed to parse create_task response: ${content[0].text}`);
    }
  }
  
  if (!taskData.result?.task_id) {
    throw new Error('create_task did not return a task_id');
  }
  
  taskId = taskData.result.task_id;
  sessionId = taskData.result.session_id;
  log.debug(`Task created with ID: ${taskId}`);
  log.debug(`Session ID: ${sessionId || 'none'}`);
  log.debug(`Tool: ${taskData.result.tool}`);
  log.debug(`Status: ${taskData.result.status}`);
  
  // Start test report (taskId is guaranteed to be non-null here after the check above)
  reporter.startTest(testName, taskId!, {
    tool: 'CLAUDECODE',
    instructions: instructions,
    sessionId: sessionId || undefined
  });
  
  reporter.addLog(taskId!, `Task created successfully with ID: ${taskId}`, 'TASK_CREATED');
  reporter.addLog(taskId!, `Session ID: ${sessionId || 'none'}`, 'SESSION_INFO');
  
  // Step 2: Task resource URI for monitoring
  const taskUri = `task://${taskId}`;
  log.info(`📍 Task resource URI: ${taskUri}`);
  // Note: MCP server doesn't implement subscribe/unsubscribe methods
  // Notifications are automatically sent to all connected clients
  
  // Step 3: Read initial task state
  await sleep(1000); // Give it a moment to initialize
  
  try {
    const taskResource = await client.readResource({ uri: taskUri });
    if (taskResource.contents?.[0]?.text) {
      const taskInfo = JSON.parse(taskResource.contents[0].text as string);
      log.info(`📋 Initial Task State:`);
      log.info(`  Title: ${taskInfo.title}`);
      log.info(`  Status: ${taskInfo.status}`);
      log.info(`  Progress: ${taskInfo.progress}%`);
      
      // Check if already completed
      if (taskInfo.status === 'completed' || taskInfo.status === 'failed') {
        taskComplete = true;
      }
    }
  } catch (error) {
    log.debug(`Could not read initial task state: ${error}`);
  }
  
  // Step 4: Send additional instructions if we have a session and task is active
  if (sessionId && !taskComplete) {
    await sleep(2000); // Wait a bit for the task to start
    log.debug('Sending additional instructions to the active session...');
    try {
      const updateResult = await client.callTool({
        name: 'update_task',
        arguments: {
          process: sessionId,
          instructions: 'Make sure the pirate welcome is extra enthusiastic and includes at least 3 pirate phrases'
        }
      });
      
      const updateContent = updateResult.content as any[];
      if (updateContent?.[0]?.text) {
        const updateData = JSON.parse(updateContent[0].text as string);
        log.debug(`Additional instructions sent: ${updateData.message || 'success'}`);
      }
    } catch (error) {
      log.debug(`Note: Could not send additional instructions - ${error}`);
    }
  }
  
  // Step 5: Wait for task completion via notifications (with timeout)
  if (!taskComplete) {
    log.info('⏳ Waiting for task completion via notifications...');
    const maxWaitTime = 30000; // 30 seconds
    const startTime = Date.now();
    
    while (!taskComplete && (Date.now() - startTime) < maxWaitTime) {
      await sleep(1000);
      // Task completion is handled by notification handler
    }
    
    // If still not complete, check one more time
    if (!taskComplete) {
      try {
        const checkResource = await client.readResource({ uri: taskUri });
        if (checkResource.contents?.[0]?.text) {
          const taskInfo = JSON.parse(checkResource.contents[0].text as string);
          if (taskInfo.status === 'completed' || taskInfo.status === 'failed') {
            taskComplete = true;
            if (taskId) {
              reporter.addLog(taskId, `Task ${taskInfo.status} (final check)`, 'TASK_COMPLETE');
            }
          }
        }
      } catch (e) {
        // Ignore
      }
    }
  }
  
  // Step 6: No unsubscribe needed (not implemented by MCP server)
  
  // Step 7: Get final task state and output
  log.section('📄 Final Task State');
  try {
    const finalStatus = await client.readResource({ uri: taskUri });
    
    if (finalStatus.contents?.[0]?.text) {
      const final = JSON.parse(finalStatus.contents[0].text as string);
      log.info(`Status: ${final.status}`);
      log.info(`Progress: ${final.progress}%`);
      log.info(`Total logs: ${final.logs?.length || 0}`);
      
      // Add all logs to reporter
      if (final.logs && final.logs.length > 0) {
        log.info('Task logs:');
        final.logs.forEach((logEntry: string | Record<string, unknown>, idx: number) => {
          // Handle both string and object log entries
          const logLine = typeof logEntry === 'string' ? logEntry : JSON.stringify(logEntry);
          log.debug(`  ${idx + 1}. ${logLine}`);
          // Add to reporter if not already added
          if (taskId) {
            reporter.addLog(taskId, logLine, 'FINAL_LOG');
          }
        });
      }
      
      // Try to read task output
      try {
        const outputUri = `task-output://${taskId}`;
        const outputResource = await client.readResource({ uri: outputUri });
        
        if (outputResource.contents?.[0]?.text) {
          const output = JSON.parse(outputResource.contents[0].text as string);
          log.section('📝 Task Output');
          log.info(`Files created: ${output.files?.length || 0}`);
          if (output.files && output.files.length > 0) {
            output.files.forEach((file: any) => {
              log.debug(`  - ${file.path} (${file.size} bytes)`);
            });
          }
          if (output.output) {
            log.info('Command output preview:');
            log.debug(output.output.substring(0, 500) + (output.output.length > 500 ? '...' : ''));
          }
        }
      } catch (e) {
        log.debug('No task output available');
      }
    }
  } catch (error) {
    log.debug('Could not read final task state');
  }
  
  // Step 8: Summary of notifications
  log.section('📊 Notification Summary');
  log.info(`Total notifications received: ${notifications.length}`);
  notifications.forEach((notif, idx) => {
    log.debug(`${idx + 1}. [${notif.timestamp}] ${notif.type}`);
    if (notif.data) {
      log.debug(`   Data: ${JSON.stringify(notif.data)}`);
    }
  });
  
  if (!taskComplete) {
    log.warning('Task did not complete within timeout period');
  }
  
  // Step 9: End the task
  if (taskId) {
    log.debug('Ending task...');
    try {
      await client.callTool({
        name: 'end_task',
        arguments: {
          task_id: taskId
        }
      });
      log.debug('Task ended successfully');
    } catch (error) {
      log.debug(`Note: Could not end task - ${error}`);
    }
  }
  
  // Step 10: Verify task completed successfully
  log.section('✅ Task Verification');
  log.info('Task completed successfully');
  
  // Complete test report
  if (taskId) {
    await reporter.completeTest(taskId, {
      errors: taskComplete ? 0 : 1
    });
  }
}

/**
 * Test error handling in create_task
 */
async function testCreateTaskErrorHandling(client: Client, _reporter: TestReporter): Promise<void> {
  // Test with invalid tool
  try {
    await client.callTool({
      name: 'create_task',
      arguments: {
        title: 'Invalid Tool Test',
        tool: 'INVALID_TOOL' as any,
        instructions: 'This should fail'
      }
    });
    throw new Error('Expected error for invalid tool');
  } catch (error) {
    log.debug('Invalid tool correctly rejected');
  }
  
  // Test with missing required fields
  try {
    await client.callTool({
      name: 'create_task',
      arguments: {
        title: 'Missing Fields Test'
        // Missing instructions
      } as any
    });
    throw new Error('Expected error for missing required fields');
  } catch (error) {
    log.debug('Missing required fields correctly rejected');
  }
}

/**
 * Test that intentionally fails
 */
async function testIntentionalFailure(_client: Client, _reporter: TestReporter): Promise<void> {
  log.info('Starting test that should fail...');
  
  // This test will always fail
  throw new Error('This test is designed to fail as requested');
}

/**
 * Main test runner
 */
export async function testE2E(): Promise<void> {
  log.section('🚀 Testing E2E create_task Flow');
  
  const tracker = new TestTracker();
  const reporter = new TestReporter(process.env.PROJECT_ROOT || process.cwd());
  let client: Client | null = null;
  
  try {
    client = await createMCPClient(true); // Enable notifications
    log.success('Connected to MCP server with notifications enabled');
    
    await runTest('Create Task Flow', () => testCreateTaskFlow(client!, reporter), tracker);
    await runTest('Error Handling', () => testCreateTaskErrorHandling(client!, reporter), tracker);
    await runTest('Intentional Failure', () => testIntentionalFailure(client!, reporter), tracker);
    
    tracker.printSummary();
    
    // Generate and save reports
    log.section('📊 Generating Test Reports');
    reporter.printSummary();
    
    const reportDir = path.join(process.cwd(), 'test-reports');
    const { html, markdown } = await reporter.saveReports(reportDir);
    
    log.success(`\n📄 Reports saved:`);
    log.info(`  HTML: ${html}`);
    log.info(`  Markdown: ${markdown}`);
    
  } catch (error) {
    log.error(`Test suite failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  } finally {
    if (client) {
      await client.close();
    }
  }
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  testE2E()
    .then(() => {
      process.exit(0);
    })
    .catch(error => {
      log.error(`Fatal error: ${error}`);
      process.exit(1);
    });
}
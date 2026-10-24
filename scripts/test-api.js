// Automated Integration Verification Script for MessageFlow API
const baseUrl = 'http://localhost:3001';
const runId = Date.now();

async function runTests() {
  console.log('=== Starting MessageFlow API Verification ===\n');
  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`  [PASS] ${message}`);
      passed++;
    } else {
      console.error(`  [FAIL] ${message}`);
      failed++;
    }
  }

  try {
    // 1. Health check
    console.log('1. Testing GET /health');
    const healthRes = await fetch(`${baseUrl}/health`);
    const healthData = await healthRes.json();
    assert(healthRes.status === 200, 'Health endpoint returns 200 OK');
    assert(healthData.status === 'ok', 'Health status is ok');
    assert(healthData.services.database === 'up', 'PostgreSQL database connectivity is UP');

    // 2. Create Message
    console.log('\n2. Testing POST /api/v1/messages');
    const createRes = await fetch(`${baseUrl}/api/v1/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-tenant-id': 'tenant-alpha',
      },
      body: JSON.stringify({
        tenantId: 'tenant-alpha',
        conversationId: 'conv-verify-100',
        to: '+919876543210',
        text: 'Your Order #9999 has shipped.',
      }),
    });
    const message = await createRes.json();
    assert(createRes.status === 201, 'Message created with 201 Created');
    assert(message.id && typeof message.id === 'string', 'Message ID is generated');
    assert(message.status === 'QUEUED', 'Initial message status is QUEUED');
    assert(message.queuedAt !== undefined, 'queuedAt timestamp is set');

    const messageId = message.id;

    // 3. Invalid payload validation
    console.log('\n3. Testing Validation & Bad Request (400)');
    const badPhoneRes = await fetch(`${baseUrl}/api/v1/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-tenant-id': 'tenant-alpha',
      },
      body: JSON.stringify({
        tenantId: 'tenant-alpha',
        conversationId: 'conv-1',
        to: 'invalid-phone',
        text: 'Hello',
      }),
    });
    assert(badPhoneRes.status === 400, 'Invalid phone number returns 400 Bad Request');

    // 4. Missing tenant header
    console.log('\n4. Testing Tenant Header Enforcement (401)');
    const noTenantRes = await fetch(`${baseUrl}/api/v1/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tenantId: 'tenant-alpha',
        conversationId: 'conv-1',
        to: '+919876543210',
        text: 'Hello',
      }),
    });
    assert(noTenantRes.status === 401, 'Missing x-tenant-id returns 401 Unauthorized');

    // 5. Tenant mismatch
    console.log('\n5. Testing Tenant Mismatch Protection (400)');
    const mismatchRes = await fetch(`${baseUrl}/api/v1/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-tenant-id': 'tenant-alpha',
      },
      body: JSON.stringify({
        tenantId: 'tenant-beta', // Mismatch!
        conversationId: 'conv-1',
        to: '+919876543210',
        text: 'Hello',
      }),
    });
    assert(mismatchRes.status === 400, 'Mismatched tenant header vs payload returns 400 Bad Request');

    // 6. Get Single Message
    console.log('\n6. Testing GET /api/v1/messages/:messageId');
    const getRes = await fetch(`${baseUrl}/api/v1/messages/${messageId}`, {
      headers: { 'x-tenant-id': 'tenant-alpha' },
    });
    const fetchedMsg = await getRes.json();
    assert(getRes.status === 200, 'Fetch single message returns 200 OK');
    assert(fetchedMsg.id === messageId, 'Fetched message ID matches');
    assert(fetchedMsg.status === 'QUEUED', 'Current status is QUEUED');

    // 7. Tenant Isolation on GET
    console.log('\n7. Testing Cross-Tenant Access Isolation');
    const crossTenantRes = await fetch(`${baseUrl}/api/v1/messages/${messageId}`, {
      headers: { 'x-tenant-id': 'tenant-beta' }, // Different tenant!
    });
    assert(crossTenantRes.status === 404, 'Cross-tenant access correctly returns 404 Not Found');

    // 8. Webhook Ingestion: DELIVERED (Fast Delivery before SENT)
    console.log('\n8. Testing Webhook Out-of-Order (DELIVERED before SENT)');
    const delEventId = `evt-test-del-${runId}`;
    const delRes = await fetch(`${baseUrl}/api/v1/webhooks/provider`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        eventId: delEventId,
        messageId,
        status: 'DELIVERED',
        occurredAt: '2026-10-24T10:15:00.000Z',
      }),
    });
    const delData = await delRes.json();
    assert(delRes.status === 200, 'DELIVERED webhook returns 200 OK');
    assert(delData.status === 'processed', 'Webhook status is processed');
    assert(delData.applied === true, 'Status change was applied');

    // Verify message status moved to DELIVERED
    const msgAfterDel = await (
      await fetch(`${baseUrl}/api/v1/messages/${messageId}`, {
        headers: { 'x-tenant-id': 'tenant-alpha' },
      })
    ).json();
    assert(msgAfterDel.status === 'DELIVERED', 'Message status advanced directly to DELIVERED');
    assert(msgAfterDel.deliveredAt !== null, 'deliveredAt is recorded');

    // 9. Webhook Out-of-Order: Delayed SENT arrives after DELIVERED
    console.log('\n9. Testing Delayed SENT Event (No status regression, records sentAt)');
    const sentEventId = `evt-test-sent-delayed-${runId}`;
    const sentRes = await fetch(`${baseUrl}/api/v1/webhooks/provider`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        eventId: sentEventId,
        messageId,
        status: 'SENT',
        occurredAt: '2026-10-24T10:05:00.000Z',
      }),
    });
    const sentData = await sentRes.json();
    assert(sentRes.status === 200, 'Delayed SENT webhook returns 200 OK');
    assert(sentData.applied === false, 'Delayed status was NOT applied to status');

    const msgAfterSent = await (
      await fetch(`${baseUrl}/api/v1/messages/${messageId}`, {
        headers: { 'x-tenant-id': 'tenant-alpha' },
      })
    ).json();
    assert(msgAfterSent.status === 'DELIVERED', 'Status remained DELIVERED (no backward regression)');
    assert(msgAfterSent.sentAt !== null, 'sentAt timestamp was successfully recorded independently!');

    // 10. Webhook Idempotency (Duplicate Event Delivery)
    console.log('\n10. Testing Webhook Deduplication / Idempotency');
    const dupRes = await fetch(`${baseUrl}/api/v1/webhooks/provider`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        eventId: delEventId, // Duplicate eventId!
        messageId,
        status: 'DELIVERED',
        occurredAt: '2026-10-24T10:15:00.000Z',
      }),
    });
    const dupData = await dupRes.json();
    assert(dupRes.status === 200, 'Duplicate webhook returns 200 OK');
    assert(dupData.status === 'duplicate', 'Status indicates duplicate');
    assert(dupData.applied === false, 'Duplicate event effect was NOT reapplied');

    // 11. Unknown Message ID
    console.log('\n11. Testing Unknown Message ID Handling (404)');
    const unknownRes = await fetch(`${baseUrl}/api/v1/webhooks/provider`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        eventId: `evt-unknown-${runId}`,
        messageId: 'non-existent-msg-id',
        status: 'SENT',
        occurredAt: '2026-10-24T10:00:00.000Z',
      }),
    });
    assert(unknownRes.status === 404, 'Unknown message ID returns 404 Not Found');

    // 12. Cursor Pagination
    console.log('\n12. Testing Cursor-Based Pagination');
    // Create 3 more messages for conv-verify-100
    for (let i = 1; i <= 3; i++) {
      await fetch(`${baseUrl}/api/v1/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-tenant-id': 'tenant-alpha',
        },
        body: JSON.stringify({
          tenantId: 'tenant-alpha',
          conversationId: 'conv-verify-100',
          to: '+919876543210',
          text: `Follow up message #${i}`,
        }),
      });
    }

    const page1Res = await fetch(
      `${baseUrl}/api/v1/conversations/conv-verify-100/messages?limit=2`,
      { headers: { 'x-tenant-id': 'tenant-alpha' } }
    );
    const page1Data = await page1Res.json();
    assert(page1Res.status === 200, 'Page 1 returns 200 OK');
    assert(page1Data.data.length === 2, 'Page 1 returns exactly 2 items');
    assert(page1Data.pagination.hasMore === true, 'Page 1 hasMore is true');
    assert(typeof page1Data.pagination.nextCursor === 'string', 'nextCursor is returned');

    // Fetch page 2
    const page2Res = await fetch(
      `${baseUrl}/api/v1/conversations/conv-verify-100/messages?limit=2&cursor=${encodeURIComponent(page1Data.pagination.nextCursor)}`,
      { headers: { 'x-tenant-id': 'tenant-alpha' } }
    );
    const page2Data = await page2Res.json();
    assert(page2Res.status === 200, 'Page 2 returns 200 OK');
    assert(page2Data.data.length === 2, 'Page 2 returns exactly 2 items');
    assert(page2Data.data[0].id !== page1Data.data[0].id, 'Page 2 items are distinct from Page 1');

    // 13. High Concurrency Webhook Stress Test (10 simultaneous events)
    console.log('\n13. Testing Simultaneous Concurrent Webhook Ingestion');
    const concurrentPayloads = [
      { eventId: `evt-c1-${runId}`, messageId, status: 'SENT', occurredAt: '2026-10-24T10:02:00.000Z' },
      { eventId: `evt-c1-${runId}`, messageId, status: 'SENT', occurredAt: '2026-10-24T10:02:00.000Z' }, // dup
      { eventId: `evt-c2-${runId}`, messageId, status: 'DELIVERED', occurredAt: '2026-10-24T10:16:00.000Z' },
      { eventId: `evt-c2-${runId}`, messageId, status: 'DELIVERED', occurredAt: '2026-10-24T10:16:00.000Z' }, // dup
      { eventId: `evt-c3-${runId}`, messageId, status: 'READ', occurredAt: '2026-10-24T10:20:00.000Z' },
      { eventId: `evt-c3-${runId}`, messageId, status: 'READ', occurredAt: '2026-10-24T10:20:00.000Z' }, // dup
      { eventId: `evt-c1-${runId}`, messageId, status: 'SENT', occurredAt: '2026-10-24T10:02:00.000Z' }, // dup
      { eventId: `evt-c4-${runId}`, messageId, status: 'READ', occurredAt: '2026-10-24T10:22:00.000Z' },
      { eventId: `evt-c2-${runId}`, messageId, status: 'DELIVERED', occurredAt: '2026-10-24T10:16:00.000Z' }, // dup
      { eventId: `evt-c5-${runId}`, messageId, status: 'READ', occurredAt: '2026-10-24T10:25:00.000Z' },
    ];

    const concurrentResults = await Promise.all(
      concurrentPayloads.map((payload) =>
        fetch(`${baseUrl}/api/v1/webhooks/provider`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
      )
    );

    const all200 = concurrentResults.every((res) => res.status === 200);
    assert(all200, 'All 10 concurrent requests returned 200 OK without errors or crashes');

    const finalMsg = await (
      await fetch(`${baseUrl}/api/v1/messages/${messageId}`, {
        headers: { 'x-tenant-id': 'tenant-alpha' },
      })
    ).json();
    assert(finalMsg.status === 'READ', 'Final status correctly progressed to READ');

    // 14. Testing Swagger Documentation Endpoints
    console.log('\n14. Testing Swagger / OpenAPI Documentation');
    const swaggerHtmlRes = await fetch(`${baseUrl}/api-docs/`);
    assert(swaggerHtmlRes.status === 200, 'Swagger UI (/api-docs/) returns 200 OK');
    const swaggerJsonRes = await fetch(`${baseUrl}/api-docs.json`);
    const swaggerDoc = await swaggerJsonRes.json();
    assert(swaggerJsonRes.status === 200, 'Swagger JSON (/api-docs.json) returns 200 OK');
    assert(swaggerDoc.info && swaggerDoc.info.title === 'MessageFlow API', 'Swagger OpenAPI spec defines MessageFlow API');
    assert(Boolean(swaggerDoc.paths['/api/v1/messages']), 'Swagger includes POST /api/v1/messages');
    assert(Boolean(swaggerDoc.paths['/api/v1/messages/{messageId}']), 'Swagger includes GET /api/v1/messages/{messageId}');
    assert(Boolean(swaggerDoc.paths['/api/v1/conversations/{conversationId}/messages']), 'Swagger includes GET /api/v1/conversations/{conversationId}/messages');
    assert(Boolean(swaggerDoc.paths['/api/v1/webhooks/provider']), 'Swagger includes POST /api/v1/webhooks/provider');
    assert(Boolean(swaggerDoc.paths['/health']), 'Swagger includes GET /health');

    console.log(`\n========================================`);
    console.log(`Verification Complete: ${passed} PASSED, ${failed} FAILED`);
    console.log(`========================================\n`);

    if (failed > 0) {
      process.exit(1);
    }
  } catch (error) {
    console.error('Test execution error:', error);
    process.exit(1);
  }
}

runTests();

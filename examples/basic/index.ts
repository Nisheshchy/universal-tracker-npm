import { createTracker } from 'trackflow';

async function main() {
  // Initialize the universal tracker
  const tracker = createTracker({
    appName: 'ecommerce-service',
    environment: 'production',
    tracking: {
      changes: true,
      activities: true,
      performance: true,
      errors: true,
    },
    redaction: {
      enabled: true,
      fields: ['password', 'creditCard', 'apiKey'],
      patterns: [/secret.*/i],
      replacement: '[REDACTED]',
    },
  });

  await tracker.start();

  console.log('--- 1. Change Tracking ---');
  tracker.changes.track('order_1001', {
    items: ['item_a'],
    total: 25.0,
    status: 'pending',
  });

  const diffs = tracker.changes.track('order_1001', {
    items: ['item_a', 'item_b'],
    total: 60.0,
    status: 'paid',
  });
  console.log('Order changes detected:', diffs);

  console.log('--- 2. Activity Tracking ---');
  tracker.activities.login('user_42', { method: 'google_oauth' });
  tracker.activities.track('cart.checkout', {
    cartId: 'c_999',
    orderTotal: 60.0,
    creditCard: '4111-0000-0000-1234', // automatically redacted!
  });

  console.log('--- 3. Performance Tracking ---');
  const queryResult = await tracker.performance.measure('fetch-recommendations', async () => {
    await new Promise((r) => setTimeout(r, 20));
    return ['item_c', 'item_d'];
  });
  console.log('Recommendations loaded:', queryResult);

  console.log('--- 4. Error Tracking ---');
  try {
    throw new TypeError('Invalid currency code provided');
  } catch (error) {
    tracker.errors.capture(error, { checkoutStep: 'payment' });
  }

  // Flush queued events to storage
  await tracker.flush();

  console.log('--- 5. Query & Export ---');
  const events = await tracker.query();
  console.log(`Total events recorded in storage: ${events.length}`);

  const exportedJson = await tracker.export('json');
  console.log('Export sample (first 200 chars):', exportedJson.slice(0, 200) + '...');

  await tracker.stop();
  console.log('TrackFlow successfully stopped.');
}

main().catch(console.error);

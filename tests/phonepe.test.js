const phonepeService = require('../src/modules/payment/phonepe.service');

async function testPhonePeIntegration() {
  console.log('--- Starting PhonePe PG Integration Verification ---');

  // 1. Test Auth Token
  console.log('\n1. Testing PhonePe Auth Token retrieval...');
  try {
    const token = await phonepeService.getAuthToken();
    console.log('✅ Auth Token retrieved successfully:', token.substring(0, 30) + '...');
  } catch (err) {
    console.error('❌ Auth token test failed:', err);
  }

  // 2. Test Checkout v2 / Pay
  console.log('\n2. Testing PhonePe Payment Initiation (checkout/v2/pay)...');
  const testOrderId = `TEST_ORDER_${Date.now()}`;
  try {
    const payResult = await phonepeService.initiatePayment({
      merchantOrderId: testOrderId,
      amountInPaise: 29900,
      redirectUrl: 'http://localhost:4200/pricing?paymentStatus=success&orderId=' + testOrderId,
      mobileNumber: '9876543210',
      merchantUserId: 'TEST_USER_1',
      planName: 'GlowCV Pro Yearly'
    });
    console.log('✅ Payment initiated successfully:', payResult);
  } catch (err) {
    console.error('❌ Payment initiation test failed:', err);
  }

  // 3. Test Order Status Check
  console.log('\n3. Testing PhonePe Order Status Check (/order/status)...');
  try {
    const statusResult = await phonepeService.checkOrderStatus(testOrderId);
    console.log('✅ Order Status check result:', statusResult);
  } catch (err) {
    console.error('❌ Order status check failed:', err);
  }

  // 4. Test Webhook Verification
  console.log('\n4. Testing Webhook Verification...');
  try {
    const mockWebhookBody = {
      merchantOrderId: testOrderId,
      state: 'COMPLETED',
      amount: 29900,
      transactionId: 'TXN_PHONPE_12345'
    };
    const webhookResult = phonepeService.verifyWebhook({}, mockWebhookBody);
    console.log('✅ Webhook verification result:', webhookResult);
  } catch (err) {
    console.error('❌ Webhook verification failed:', err);
  }

  console.log('\n--- All PhonePe Integration Tests Finished ---');
}

testPhonePeIntegration();

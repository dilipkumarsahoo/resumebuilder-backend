const express = require('express');
const router = express.Router();
const phonepeService = require('./phonepe.service');
const prisma = require('../../config/db');

/**
 * 1. Test Auth Token Endpoint
 * Merchant Server -> PhonePe PG Server: Get auth token
 */
router.get('/phonepe/auth-token', async (req, res) => {
  try {
    const token = await phonepeService.getAuthToken();
    res.status(200).json({ success: true, token });
  } catch (error) {
    console.error('Error fetching PhonePe token:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * 2. Initiate Payment (Calls checkout/v2/pay)
 * Merchant Server -> PhonePe PG Server: Call checkout/v2/pay
 * PhonePe PG Server -> Merchant Server: Receive redirect url
 */
router.post('/phonepe/pay', async (req, res) => {
  try {
    const { amount, phone, plan, userId } = req.body;

    const merchantOrderId = `ORDER_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
    const amountInPaise = Math.round((amount || 299) * 100);
    const frontendBaseUrl = process.env.APP_FRONTEND_URL || 'http://localhost:4200';
    const redirectUrl = `${frontendBaseUrl}/pricing?paymentStatus=success&orderId=${merchantOrderId}`;

    // Save initial Payment record in DB (gracefully handles DB connection)
    try {
      if (prisma && prisma.payment) {
        await prisma.payment.create({
          data: {
            merchantOrderId: merchantOrderId,
            amount: amountInPaise,
            currency: 'INR',
            status: 'PENDING',
            plan: plan || 'PRO_YEARLY',
            mobileNumber: phone || null,
            userId: userId ? Number(userId) : null
          }
        });
      }
    } catch (dbErr) {
      console.warn('[Payment Routes] DB create payment warning:', dbErr.message);
    }

    // Call PhonePe Checkout v2 Pay
    const payResult = await phonepeService.initiatePayment({
      merchantOrderId,
      amountInPaise,
      redirectUrl,
      mobileNumber: phone,
      merchantUserId: userId ? `USER_${userId}` : `MUID_${Date.now()}`,
      planName: plan || 'GlowCV Pro'
    });

    return res.status(200).json({
      success: true,
      redirectUrl: payResult.redirectUrl,
      merchantOrderId: merchantOrderId,
      data: payResult.data || null
    });
  } catch (error) {
    console.error('[Payment Routes] PhonePe Pay initiation failed:', error);
    res.status(500).json({
      success: false,
      message: 'Payment initiation failed',
      error: error.message
    });
  }
});

/**
 * 3. Webhook Receiver from PhonePe PG Server
 * PhonePe PG Server -> Merchant Server: Webhook response
 */
router.post('/phonepe/webhook', async (req, res) => {
  try {
    console.log('[Payment Routes] PhonePe Webhook notification received:', req.body);
    const result = phonepeService.verifyWebhook(req.headers, req.body);

    if (result.isValid && result.merchantOrderId) {
      const isSuccess = result.state === 'COMPLETED' || result.state === 'SUCCESS';
      const status = isSuccess ? 'SUCCESS' : 'FAILED';

      try {
        if (prisma && prisma.payment) {
          const payment = await prisma.payment.update({
            where: { merchantOrderId: result.merchantOrderId },
            data: {
              status: status,
              phonepeTransactionId: result.transactionId || undefined,
              rawResponse: JSON.stringify(result.raw || {})
            },
            include: { user: true }
          });

          // If user exists and payment succeeded, grant Pro access
          if (isSuccess && payment && payment.userId) {
            await prisma.user.update({
              where: { id: payment.userId },
              data: { isPro: true }
            });
            console.log(`[Payment Routes] User ID ${payment.userId} upgraded to Pro!`);
          }
        }
      } catch (dbErr) {
        console.warn('[Payment Routes] DB webhook update warning:', dbErr.message);
      }
    }

    // Return 200 OK to PhonePe server
    return res.status(200).json({ status: 'OK' });
  } catch (error) {
    console.error('[Payment Routes] Webhook processing error:', error);
    return res.status(500).json({ error: 'Webhook processing error' });
  }
});

// Alias for callback URL
router.post('/phonepe/callback', async (req, res) => {
  try {
    console.log('[Payment Routes] PhonePe Callback received:', req.body);
    const result = phonepeService.verifyWebhook(req.headers, req.body);
    return res.status(200).json({ status: 'OK', result });
  } catch (error) {
    return res.status(500).send('Error');
  }
});

/**
 * 4. Check Order Status
 * "If webhook not received Call /order/status" -> "Response - 2xx"
 */
router.get('/phonepe/order-status/:orderId', async (req, res) => {
  try {
    const { orderId } = req.params;
    const statusResult = await phonepeService.checkOrderStatus(orderId);
    const isSuccess = statusResult.state === 'COMPLETED' || statusResult.success;

    try {
      if (prisma && prisma.payment) {
        const payment = await prisma.payment.update({
          where: { merchantOrderId: orderId },
          data: {
            status: isSuccess ? 'SUCCESS' : (statusResult.state === 'FAILED' ? 'FAILED' : 'PENDING'),
            phonepeTransactionId: statusResult.phonepeTransactionId || undefined,
            rawResponse: JSON.stringify(statusResult.rawData || {})
          }
        });

        if (isSuccess && payment && payment.userId) {
          await prisma.user.update({
            where: { id: payment.userId },
            data: { isPro: true }
          });
        }
      }
    } catch (dbErr) {
      console.warn('[Payment Routes] DB status check warning:', dbErr.message);
    }

    return res.status(200).json({
      success: isSuccess,
      state: statusResult.state,
      merchantOrderId: orderId,
      transactionId: statusResult.phonepeTransactionId,
      amount: statusResult.amount,
      data: statusResult.rawData
    });
  } catch (error) {
    console.error('[Payment Routes] Order Status Check error:', error);
    res.status(500).json({ success: false, message: 'Order status check failed', error: error.message });
  }
});

/**
 * 5. Verify endpoint for frontend verification post-redirect
 */
router.post('/phonepe/verify', async (req, res) => {
  try {
    const { merchantTransactionId, merchantOrderId, orderId } = req.body;
    const targetOrderId = orderId || merchantOrderId || merchantTransactionId;

    if (!targetOrderId) {
      return res.status(400).json({ success: false, message: 'orderId or merchantTransactionId is required' });
    }

    const statusResult = await phonepeService.checkOrderStatus(targetOrderId);
    const isSuccess = statusResult.state === 'COMPLETED' || statusResult.success;

    return res.status(200).json({
      success: isSuccess,
      code: isSuccess ? 'PAYMENT_SUCCESS' : 'PAYMENT_PENDING',
      message: isSuccess ? 'Payment Verified Successfully' : 'Payment is Pending',
      merchantOrderId: targetOrderId,
      state: statusResult.state,
      data: statusResult.rawData
    });
  } catch (error) {
    console.error('[Payment Routes] Verify error:', error);
    res.status(500).json({ success: false, message: 'Payment verification failed' });
  }
});

module.exports = router;

# Android SMS → Flask webhook (sample Kotlin/OkHttp sketch)
#
# Use an SMS-forwarder app (or your own BroadcastReceiver) that only runs
# on the merchant device receiving cash/InstaPay notifications.

"""
POST {BASE_URL}/api/payment/webhook
Header: X-Webhook-Token: <token from admin settings>
Body JSON:
{
  "message": "<full SMS body>",
  "sender": "<wallet number if known>",
  "amount": 100,
  "provider": "vodafone_cash",  // or instapay, orange_cash, etisalat_cash, we_pay
  "transaction_ref": "optional",
  "sender_app": "Vodafone Cash" // SMS address / app label
}
"""

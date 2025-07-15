// 檔案路徑: netlify/functions/create-ecpay-order.js
// 最終版本 - 整合 n8n 訂單建立與門市資訊紀錄

const fetch = require('node-fetch');
const crypto = require('crypto');

function generateCheckMacValue(params, hashKey, hashIV) {
    const sortedKeys = Object.keys(params).sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
    let checkString = sortedKeys.map(key => `${key}=${params[key]}`).join('&');
    checkString = `HashKey=${hashKey}&${checkString}&HashIV=${hashIV}`;
    let encodedString = encodeURIComponent(checkString).toLowerCase();
    encodedString = encodedString.replace(/'/g, "%27").replace(/~/g, "%7e").replace(/%20/g, "+");
    const hash = crypto.createHash('sha256').update(encodedString).digest('hex');
    return hash.toUpperCase();
}

exports.handler = async function(event, context) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const { cart, logisticsType, storeInfo } = JSON.parse(event.body);
    const merchantID = process.env.ECPAY_MERCHANT_ID;
    const hashKey = process.env.ECPAY_HASH_KEY;
    const hashIV = process.env.ECPAY_HASH_IV;
    const returnURL = `${process.env.URL}/.netlify/functions/ecpay-return`;
    const merchantTradeNo = `BAMBOO${Date.now()}`;
    const totalAmount = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
    const itemName = cart.map(item => `${item.name} x ${item.quantity}`).join('#');
    const tradeDate = new Date().toLocaleString('zh-TW', {
        timeZone: 'Asia/Taipei', hour12: false, year: 'numeric', month: '2-digit',
        day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit'
    }).replace(/-/g, '/');

    let orderParams = {
      MerchantID: merchantID,
      MerchantTradeNo: merchantTradeNo,
      MerchantTradeDate: tradeDate,
      PaymentType: 'aio',
      TotalAmount: totalAmount,
      TradeDesc: '竹意軒咖啡工坊線上訂單',
      ItemName: itemName,
      ReturnURL: returnURL,
      ChoosePayment: 'ALL',
      EncryptType: 1,
    };

    // 準備要發送到 n8n 的資料
    const payloadToN8n = {
        merchantTradeNo: merchantTradeNo,
        itemName: itemName,
        totalAmount: totalAmount,
        tradeDate: tradeDate,
        status: 'PENDING' // 初始狀態為待付款
    };

    // 如果是超商取貨，我們將門市資訊同時加入到 orderParams 和 n8n 的 payload 中
    if (logisticsType === 'CVS' && storeInfo) {
        orderParams.CustomField1 = JSON.stringify(storeInfo); // 嘗試偷渡，雖然不會被回傳，但沒有壞處
        payloadToN8n.storeInfo = storeInfo; // 將門市資訊明確地加入到要發送至 n8n 的資料中
        payloadToN8n.logisticsType = 'CVS';
    } else {
        payloadToN8n.logisticsType = 'HOME';
    }

    // ▼▼▼ 在建立綠界訂單前，先呼叫 n8n Webhook 記錄這筆訂單 ▼▼▼
    try {
      // 這裡請使用您「建立訂單」的 n8n webhook URL
      const n8n_create_order_webhook = 'https://BambooLee-n8n-free.hf.space/webhook/c188e2c1-6492-40de-9cf6-9e9d865c9fb5'; 
      
      await fetch(n8n_create_order_webhook, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payloadToN8n),
      });
      console.log(`[N8N] 已觸發「建立訂單」工作流 for ${merchantTradeNo}`);
    } catch (n8nError) {
      console.error('[N8N] 觸發「建立訂單」工作流時發生錯誤:', n8nError);
      // 即使 n8n 失敗，我們仍然繼續金流流程，確保顧客可以付款
    }
    // ▲▲▲ 已恢復 n8n 呼叫 ▲▲▲

    const checkMacValue = generateCheckMacValue(orderParams, hashKey, hashIV);

    return {
      statusCode: 200,
      body: JSON.stringify({
        orderData: orderParams,
        checkMacValue: checkMacValue,
        paymentUrl: 'https://payment-stage.ecpay.com.tw/Cashier/AioCheckOut'
      })
    };

  } catch (error) {
    console.error('create-ecpay-order function 發生錯誤:', error);
    return { statusCode: 500, body: JSON.stringify({ error: `伺服器內部錯誤: ${error.message}` }) };
  }
};
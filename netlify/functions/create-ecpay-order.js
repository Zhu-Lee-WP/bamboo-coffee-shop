// 檔案路徑: netlify/functions/create-ecpay-order.js
// 最終版本 - 移除 Netlify Forms，改為呼叫 n8n 建立訂單

const fetch = require('node-fetch');
const crypto = require('crypto');

// ... generateCheckMacValue 函式維持不變 ...
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
    // 現在我們也接收 storeInfo
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

    // ▼▼▼ 這是一個全新的、簡化的 orderParams 物件 ▼▼▼
    let orderParams = {
      MerchantID: merchantID,
      MerchantTradeNo: merchantTradeNo,
      MerchantTradeDate: tradeDate,
      PaymentType: 'aio',
      TotalAmount: totalAmount,
      TradeDesc: '竹意軒咖啡工坊線上訂單',
      ItemName: itemName,
      ReturnURL: returnURL,
      ChoosePayment: 'ALL', // 讓金流歸金流，使用者可以選任何方式付款
      EncryptType: 1,
    };

    // 如果是超商取貨，我們只做一件事：把門市資訊打包塞進自訂欄位
    if (logisticsType === 'CVS' && storeInfo) {
        orderParams.CustomField1 = JSON.stringify(storeInfo); // 將門市資訊偷渡過去
    }
    // ▲▲▲ 修改完成 ▲▲▲

    // ... (您原本呼叫 n8n 的邏輯可以保留) ...

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
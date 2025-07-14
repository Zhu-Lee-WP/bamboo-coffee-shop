// 檔案路徑: netlify/functions/create-ecpay-order.js
// 【儲存訂單最終版】- 新增了將訂單儲存至 Netlify Forms 的功能

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

/**
 * ▼▼▼ 新增的函式：儲存訂單到 Netlify Forms ▼▼▼
 */
async function saveOrderToNetlifyForms(orderData) {
  const formData = new URLSearchParams();
  formData.append('form-name', 'orders'); // 'orders' 必須對應到 HTML 中的 form name
  formData.append('merchantTradeNo', orderData.MerchantTradeNo);
  formData.append('totalAmount', orderData.TotalAmount);
  formData.append('itemName', orderData.ItemName);
  formData.append('tradeStatus', 'PENDING'); // 先將訂單狀態標示為「等待付款」

  try {
    // 將表單資料 POST 到我們自己的網站，Netlify 會自動攔截並儲存
    await fetch(process.env.URL || 'http://localhost:8888', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: formData.toString(),
    });
    console.log('訂單已成功儲存至 Netlify Forms。');
  } catch (error) {
    console.error('儲存訂單至 Netlify Forms 時發生錯誤:', error);
    // 即使儲存失敗，我們仍然繼續付款流程，確保使用者可以付款
  }
}


exports.handler = async function(event, context) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    // ... (這部分準備訂單參數的程式碼不變) ...
    const cartData = JSON.parse(event.body);
    const merchantID = process.env.ECPAY_MERCHANT_ID;
    const hashKey = process.env.ECPAY_HASH_KEY;
    const hashIV = process.env.ECPAY_HASH_IV;
    const returnURL = process.env.URL || 'http://localhost:8888';
    const merchantTradeNo = `BAMBOO${Date.now()}`;
    const totalAmount = cartData.reduce((sum, item) => sum + item.price * item.quantity, 0);
    const itemName = cartData.map(item => `${item.name} x ${item.quantity}`).join('#');
    const tradeDate = new Date().toLocaleString('zh-TW', { timeZone: 'Asia/Taipei', hour12: false, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).replace(/-/g, '/');

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

    // ▼▼▼ 在產生加密碼之前，先執行儲存訂單的動作 ▼▼▼
    await saveOrderToNetlifyForms(orderParams);

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
    console.error('後端 Function 出錯:', error);
    return { statusCode: 500, body: JSON.stringify({ error: `伺服器內部錯誤: ${error.message}` }) };
  }
};
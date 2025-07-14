// 檔案路徑: netlify/functions/create-ecpay-order.js
// 最終修正版 - 使用最穩固的方式產生日期格式

const fetch = require('node-fetch');
const crypto = require('crypto');

// ... generateCheckMacValue 和 saveOrderToNetlifyForms 函式維持不變 ...
function generateCheckMacValue(params, hashKey, hashIV) {
    const sortedKeys = Object.keys(params).sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
    let checkString = sortedKeys.map(key => `${key}=${params[key]}`).join('&');
    checkString = `HashKey=${hashKey}&${checkString}&HashIV=${hashIV}`;
    let encodedString = encodeURIComponent(checkString).toLowerCase();
    encodedString = encodedString.replace(/'/g, "%27").replace(/~/g, "%7e").replace(/%20/g, "+");
    const hash = crypto.createHash('sha256').update(encodedString).digest('hex');
    return hash.toUpperCase();
}
async function saveOrderToNetlifyForms(orderData) {
    const formData = new URLSearchParams();
    formData.append('form-name', 'orders');
    formData.append('merchantTradeNo', orderData.MerchantTradeNo);
    formData.append('totalAmount', orderData.TotalAmount);
    formData.append('itemName', orderData.ItemName);
    formData.append('tradeStatus', 'PENDING');
    try {
        await fetch(process.env.URL || 'http://localhost:8888', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: formData.toString(),
        });
        console.log('訂單已成功儲存至 Netlify Forms。');
    } catch (error) {
        console.error('儲存訂單至 Netlify Forms 時發生錯誤:', error);
    }
}


exports.handler = async function(event, context) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const cartData = JSON.parse(event.body);
    const merchantID = process.env.ECPAY_MERCHANT_ID;
    const hashKey = process.env.ECPAY_HASH_KEY;
    const hashIV = process.env.ECPAY_HASH_IV;
    const returnURL = `${process.env.URL}/.netlify/functions/ecpay-return`;
    const merchantTradeNo = `BAMBOO${Date.now()}`;
    const totalAmount = cartData.reduce((sum, item) => sum + item.price * item.quantity, 0);
    const itemName = cartData.map(item => `${item.name} x ${item.quantity}`).join('#');

    // ▼▼▼ 我們用最穩固、最安全的方式來產生日期 ▼▼▼
    const now = new Date();
    const year = now.getFullYear();
    const month = (now.getMonth() + 1).toString().padStart(2, '0');
    const day = now.getDate().toString().padStart(2, '0');
    const hours = now.getHours().toString().padStart(2, '0');
    const minutes = now.getMinutes().toString().padStart(2, '0');
    const seconds = now.getSeconds().toString().padStart(2, '0');
    const tradeDate = `${year}/${month}/${day} ${hours}:${minutes}:${seconds}`;
    // ▲▲▲ 我們用最穩固、最安全的方式來產生日期 ▲▲▲

    let orderParams = {
      MerchantID: merchantID,
      MerchantTradeNo: merchantTradeNo,
      MerchantTradeDate: tradeDate,
      PaymentType: 'aio',
      TotalAmount: totalAmount,
      TradeDesc: '竹意軒咖啡工坊線上訂單',
      ItemName: itemName,
      ReturnURL: `${process.env.URL}/.netlify/functions/ecpay-return`,
      OrderResultURL: `${process.env.URL}/order-complete.html`,
      ClientBackURL: `${process.env.URL}/order-complete.html`,
      ChoosePayment: 'ALL',
      EncryptType: 1,
    };

    // 我們的邏輯是先儲存訂單到 Netlify Forms，再產生加密碼
    // (如果未來要換成 n8n+Google Sheets，也是在這個位置)
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
    console.error('create-ecpay-order function 發生錯誤:', error);
    return { statusCode: 500, body: JSON.stringify({ error: `伺服器內部錯誤: ${error.message}` }) };
  }
};
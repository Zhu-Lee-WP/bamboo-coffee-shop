// 檔案路徑: netlify/functions/create-ecpay-order.js
// 最終修正 - 使用 toLocaleString 校正交易時間的時區

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

    // ▼▼▼ 將手動產生的日期區塊，替換成下面這一行 ▼▼▼
    const tradeDate = new Date().toLocaleString('zh-TW', {
        timeZone: 'Asia/Taipei',
        hour12: false,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    }).replace(/-/g, '/');
    // ▲▲▲ 這能確保無論伺服器在哪，都能產生出「台灣時區」的正確時間格式 ▲▲▲

    let orderParams = {
      MerchantID: merchantID,
      MerchantTradeNo: merchantTradeNo,
      MerchantTradeDate: tradeDate,
      PaymentType: 'aio',
      TotalAmount: totalAmount,
      TradeDesc: '竹意軒咖啡工坊線上訂單',
      ItemName: itemName,
      ReturnURL: returnURL,
      OrderResultURL: `${process.env.URL}/order-complete`,
      ClientBackURL: `${process.env.URL}/order-complete`,
      ChoosePayment: 'ALL',
      EncryptType: 1,
    };

    console.log("準備發送到綠界的參數:", JSON.stringify(orderParams, null, 2));
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
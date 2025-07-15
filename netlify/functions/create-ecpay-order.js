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
    const { cart, logisticsType } = JSON.parse(event.body);
    const merchantID = process.env.ECPAY_MERCHANT_ID;
    const hashKey = process.env.ECPAY_HASH_KEY;
    const hashIV = process.env.ECPAY_HASH_IV;
    const returnURL = `${process.env.URL}/.netlify/functions/ecpay-return`;
    const merchantTradeNo = `BAMBOO${Date.now()}`;
    const totalAmount = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
    const itemName = cart.map(item => `${item.name} x ${item.quantity}`).join('#');
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

    let orderParams = {
      MerchantID: merchantID,
      MerchantTradeNo: merchantTradeNo,
      MerchantTradeDate: tradeDate,
      PaymentType: 'aio',
      TotalAmount: totalAmount,
      TradeDesc: '竹意軒咖啡工坊線上訂單',
      ItemName: itemName,
      ReturnURL: returnURL,
      OrderResultURL: `${process.env.URL}/.netlify/functions/ecpay-finalize`,
      ClientBackURL: `${process.env.URL}/.netlify/functions/ecpay-finalize`,
      ChoosePayment: 'ALL',
      NeedExtraPaidInfo: 'Y',
      EncryptType: 1,
    };
    // ▼▼▼ 這是新加入的，用來處理物流參數的核心邏輯 ▼▼▼
    if (logisticsType === 'CVS') {
  // 因為我們已經打開了 NeedExtraPaidInfo 的總開關，
  // 所以現在可以加入所有物流擴充規格允許的參數了。
  orderParams.LogisticsType = 'CVS';
  orderParams.LogisticsSubType = 'UNIMART';
  orderParams.GoodsName = '竹意軒咖啡工坊商品一批';
  orderParams.GoodsAmount = totalAmount;
  orderParams.ServerReplyURL = `${process.env.URL}/.netlify/functions/ecpay-logistics-return`;

  // 根據文件，IsCollection 和 ClientReplyURL 確實不屬於這裡，保持註解。
  // orderParams.IsCollection = 'Y';
  // orderParams.ClientReplyURL = `${process.env.URL}/map-return.html`;
}
    // ▲▲▲ 這是新加入的 ▲▲▲

    // ▼▼▼ 我們將呼叫 Netlify Forms 的邏輯，替換成呼叫 n8n Workflow A ▼▼▼
    try {
      const n8n_create_order_webhook = 'https://BambooLee-n8n-free.hf.space/webhook/c188e2c1-6492-40de-9cf6-9e9d865c9fb5';
      await fetch(n8n_create_order_webhook, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          merchantTradeNo: merchantTradeNo,
          itemName: itemName,
          totalAmount: totalAmount,
          tradeDate: tradeDate
        }),
      });
      console.log('已觸發 n8n「建立訂單」工作流。');
    } catch (n8nError) {
      console.error('觸發 n8n「建立訂單」工作流時發生錯誤:', n8nError);
    }
    // ▲▲▲ 替換完成 ▲▲▲

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
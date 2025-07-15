// 檔案路徑: netlify/functions/create-ecpay-order.js
// 這是決定性的修正版本

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
    const { cart, logisticsType } = JSON.parse(event.body);
    const merchantID = process.env.ECPAY_MERCHANT_ID;
    const hashKey = process.env.ECPAY_HASH_KEY;
    const hashIV = process.env.ECPAY_HASH_IV;
    const merchantTradeNo = `BAMBOO${Date.now()}`;
    const totalAmount = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
    const itemName = cart.map(item => `${item.name} x ${item.quantity}`).join('#');
    const tradeDate = new Date().toLocaleString('zh-TW', {
        timeZone: 'Asia/Taipei',
        hour12: false,
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit'
    }).replace(/-/g, '/');

    // ==========================================================
    // ▼▼▼ 這是本次修正的核心：我們建立一個基礎訂單參數 ▼▼▼
    // ==========================================================
    let orderParams = {
      MerchantID: merchantID,
      MerchantTradeNo: merchantTradeNo,
      MerchantTradeDate: tradeDate,
      PaymentType: 'aio',
      TotalAmount: totalAmount,
      TradeDesc: '竹意軒咖啡工坊線上訂單',
      ItemName: itemName,
      ReturnURL: `${process.env.URL}/.netlify/functions/ecpay-return`, // 金流付款結果通知
      OrderResultURL: `${process.env.URL}/.netlify/functions/ecpay-finalize`, // 前端導向
      EncryptType: 1,
    };

    // ==========================================================
    // ▼▼▼ 根據物流類型，決定訂單的走向 ▼▼▼
    // ==========================================================
    if (logisticsType === 'CVS') {
      // --- 情況一：使用者選擇超商取貨 ---
      // 我們要建立的是一筆「物流訂單」，付款方式直接指定為超商
      
      orderParams.ChoosePayment = 'UNIMART_C2C'; // 指定付款方式為 7-11 C2C 取貨付款
      orderParams.LogisticsType = 'CVS';
      orderParams.LogisticsSubType = 'UNIMART';
      
      // 因為付款方式已經是物流了，所以我們「必須」提供物流需要的參數
      // 所以這次我們要「取消註解」這些參數
      orderParams.GoodsName = '竹意軒咖啡工坊商品一批';
      orderParams.GoodsAmount = totalAmount; // 包裹價值
      
      // 物流狀態通知網址 (例如：已到店、已取貨)
      orderParams.ServerReplyURL = `${process.env.URL}/.netlify/functions/ecpay-logistics-return`; // 建議你為物流狀態建立一個新的 n8n webhook
      // 當顧客在地圖選好門市後，綠界會將顧客導向到這個網址
      orderParams.LogisticsC2CReplyURL = `${process.env.URL}/.netlify/functions/ecpay-logistics-return`; 
      
      // ** 注意：不再需要 IsCollection, ClientReplyURL 等參數，因為 ChoosePayment 已經決定了一切

    } else {
      // --- 情況二：使用者選擇宅配 (或其他非物流的付款方式) ---
      // 這就是一筆純金流訂單
      orderParams.ChoosePayment = 'ALL'; // 讓使用者可以選擇信用卡、ATM等
    }
    
    // ==========================================================
    // ▼▼▼ n8n 紀錄訂單的邏輯維持不變 ▼▼▼
    // ==========================================================
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
    
    // ==========================================================
    // ▼▼▼ 產生驗證碼並回傳給前端的邏輯維持不變 ▼▼▼
    // ==========================================================
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
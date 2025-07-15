// 檔案路徑: netlify/functions/ecpay-return.js (最終 n8n 整合版)
const crypto = require('crypto');
const fetch = require('node-fetch');

function generateCheckMacValue(params, hashKey, hashIV) {
    const sortedKeys = Object.keys(params).filter(key => key !== 'CheckMacValue').sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
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
    const ecpayResponse = new URLSearchParams(event.body);
    const responseData = Object.fromEntries(ecpayResponse.entries());
    console.log("從綠界收到的完整回傳資料:", JSON.stringify(responseData, null, 2));
    
    // 安全驗證
    const hashKey = process.env.ECPAY_HASH_KEY;
    const hashIV = process.env.ECPAY_HASH_IV;
    if (responseData.CheckMacValue !== generateCheckMacValue(responseData, hashKey, hashIV)) {
        console.error('CheckMacValue 驗證失敗！');
        return { statusCode: 400, body: 'Invalid CheckMacValue' };
    }

    // 當付款成功時
    if (responseData.RtnCode === '1') {
      console.log(`訂單 ${responseData.MerchantTradeNo} 付款成功。`);
      
      // 您可以保留呼叫 n8n "更新訂單狀態為PAID" 的邏輯於此
      
      // ▼▼▼ 全新的物流訂單建立流程 ▼▼▼
      try {
        // ▼▼▼ 請將這裡的網址，換成您在 n8n 建立的「查詢訂單」Webhook URL ▼▼▼
        const N8N_GET_ORDER_WEBHOOK = 'https://BambooLee-n8n-free.hf.space/webhook/7c170abb-ef30-41d4-b96e-0704926901dc'; 
        // ▲▲▲ 請將這裡的網址，換成您在 n8n 建立的「查詢訂單」Webhook URL ▲▲▲

        // 1. 先去 n8n 把這筆訂單的門市資訊查回來
        console.log(`正在向 n8n 查詢訂單 ${responseData.MerchantTradeNo} 的門市資訊...`);
        const getStoreInfoResponse = await fetch(`${N8N_GET_ORDER_WEBHOOK}?tradeNo=${responseData.MerchantTradeNo}`);
        const orderDetails = await getStoreInfoResponse.json();
        console.log(`從 n8n 收到的回覆:`, JSON.stringify(orderDetails, null, 2));
        
        // 2. 確定有查到門市資訊，才進行下一步
        if (orderDetails && orderDetails.storeInfo && orderDetails.storeInfo.id) {
          console.log(`從 n8n 查到門市資訊，準備為訂單 ${responseData.MerchantTradeNo} 建立物流訂單。`);
          
          // 3. 呼叫 create-shipping-order，把付款資料和查回來的門市資訊都傳過去
          await fetch(`${process.env.URL}/.netlify/functions/create-shipping-order`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              paymentData: responseData,
              storeInfo: orderDetails.storeInfo 
            }),
          });
          console.log(`物流訂單建立請求已發送。`);
        } else {
            console.log(`訂單 ${responseData.MerchantTradeNo} 非超商訂單，或在 n8n 中找不到對應門市資訊。`);
        }
      } catch (shippingError) {
        console.error('[錯誤] 查詢n8n或建立物流訂單時失敗:', shippingError);
      }
      // ▲▲▲ 物流訂單流程結束 ▲▲▲
    }

    const thankYouUrl = `/order-complete.html?orderId=${responseData.MerchantTradeNo}`;
    return {
      statusCode: 302,
      headers: { Location: thankYouUrl },
    };

  } catch (error) {
    console.error('ecpay-return function 發生錯誤:', error);
    return { statusCode: 302, headers: { Location: process.env.URL || '/' } };
  }
};
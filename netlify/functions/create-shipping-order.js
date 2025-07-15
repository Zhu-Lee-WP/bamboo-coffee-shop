// 檔案路徑: netlify/functions/create-shipping-order.js
const fetch = require('node-fetch');
const crypto = require('crypto');

// ... (這裡也需要 generateCheckMacValue 函式) ...
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
  try {
    const { paymentData, storeInfo } = JSON.parse(event.body);
    const hashKey = process.env.ECPAY_HASH_KEY;
    const hashIV = process.env.ECPAY_HASH_IV;
    const merchantID = process.env.ECPAY_MERCHANT_ID;

    // ▼▼▼ 這裡的參數，是 B 櫃台 (物流 API) 看得懂的參數 ▼▼▼
    const shippingParams = {
      MerchantID: merchantID,
      MerchantTradeNo: paymentData.MerchantTradeNo, // 使用金流的訂單編號來關聯
      MerchantTradeDate: paymentData.TradeDate,
      LogisticsType: 'CVS',
      LogisticsSubType: 'UNIMART',
      GoodsAmount: parseInt(paymentData.TradeAmt, 10),
      CollectionAmount: parseInt(paymentData.TradeAmt, 10), // 如果是貨到付款，這裡要跟 GoodsAmount 一樣
      IsCollection: 'Y', // Y=貨到付款, N=純取貨
      GoodsName: '竹意軒咖啡工坊商品', // 商品名稱
      SenderName: '竹意軒的咖啡工坊', // 您的姓名/公司名
      SenderPhone: '0912345678', // 您的電話
      ReceiverName: '顧客', // 在此階段通常是固定值，或從會員系統來
      ReceiverPhone: '0987654321', // 同上
      ReceiverCellPhone: '0987654321', // 同上
      CVSStoreID: storeInfo.id,
      CVSStoreName: storeInfo.name,
      TradeDesc: '訂單物流',
      ServerReplyURL: `${process.env.URL}/.netlify/functions/ecpay-logistics-return`, // 物流狀態更新的回傳網址
      LogisticsC2CReplyURL: `${process.env.URL}/.netlify/functions/ecpay-logistics-return`,
    };

    const checkMacValue = generateCheckMacValue(shippingParams, hashKey, hashIV);

    const logisticsApiUrl = 'https://logistics-stage.ecpay.com.tw/Express/Create';
    const formBody = new URLSearchParams({
        ...shippingParams,
        CheckMacValue: checkMacValue
    }).toString();

    const shippingResponse = await fetch(logisticsApiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: formBody,
    });

    const responseText = await shippingResponse.text();
    console.log('綠界物流 API 回應:', responseText);
    // 回應格式: 1|OK或 0|錯誤訊息，後面會帶一堆&符號串接的資料

    return { statusCode: 200, body: 'OK' };

  } catch (error) {
    console.error('create-shipping-order 發生錯誤:', error);
    return { statusCode: 500, body: error.toString() };
  }
};
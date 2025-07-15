// 檔案路徑: netlify/functions/get-cvs-map-params.js
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
  const merchantID = process.env.ECPAY_MERCHANT_ID;
  const hashKey = process.env.ECPAY_HASH_KEY;
  const hashIV = process.env.ECPAY_HASH_IV;

  const mapParams = {
    MerchantID: merchantID,
    MerchantTradeNo: `TMP${Date.now()}`, // 地圖需要一個暫時的訂單編號
    LogisticsType: 'CVS',
    LogisticsSubType: 'UNIMART', // UNIMART=7-11, FAMI=全家
    IsCollection: 'Y', // Y=可貨到付款, N=純取貨
    ServerReplyURL: `${process.env.URL}/.netlify/functions/ecpay-map-return`, // 使用者選好門市後，綠界要跳轉回來的頁面
    ExtraData: 'BAMBOO_CVS_SELECTION', // 自訂字串，用來識別
  };

  const checkMacValue = generateCheckMacValue(mapParams, hashKey, hashIV);

  return {
    statusCode: 200,
    body: JSON.stringify({
      mapParams: mapParams,
      checkMacValue: checkMacValue,
      mapUrl: 'https://logistics-stage.ecpay.com.tw/Express/map' // 注意：這裡是物流的測試網址
    })
  };
};